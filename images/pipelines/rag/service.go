package rag

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"pipelines/config"
	"pipelines/logger"
	"pipelines/nodes"
	"pipelines/utils"
)

// Knowledge bases (RAG)
//
// A group whose knowledge base is enabled (for its organization and for
// the group, in admin_api; off by default) has the documents its
// administrators upload to org_data/org_<org>/group_<group>/knowledge/ in
// the bucket. Pipelines indexes them in the rag schema of patroni_admin
// (text, then chunks, then embeddings) and answers, for the AI agents of
// each digital twin, which of them it may read (chosen in the digital
// twin: none unless chosen) and searches over those, through an HTTP
// endpoint on the loopback interface that the agents' doc_info MCP
// servers call.

// maxDocumentBytes bounds what is read from the bucket to index.
const maxDocumentBytes = 100 << 20

// KnowledgePrefix is where a group's knowledge base lives in the bucket.
func KnowledgePrefix(orgID, groupID int) string {
	return fmt.Sprintf("org_data/org_%d/group_%d/knowledge/", orgID, groupID)
}

// Service is the knowledge bases of one pipelines replica.
type Service struct {
	cfg    config.RagConfig
	store  *Store
	s3     *s3.Client
	bucket string
	log    *logger.Logger

	// One embedder per provider (cpu, cuda), loaded on first use (or by
	// Preload) and kept for the life of the process.
	embedMu   sync.Mutex
	embedders map[string]*Embedder

	policyMu sync.Mutex
	// gpuForGroup tells whether a group's embeddings run on this
	// replica's GPU (see SetGPUPolicy). nil: always CPU.
	gpuForGroup func(groupID int) bool
	// ragForGroup tells whether a group's knowledge base is enabled (see
	// SetRAGPolicy). nil: none is.
	ragForGroup func(groupID int) bool

	tokenKey []byte // signs the per-digital-twin tokens
}

// NewService returns the knowledge bases' service, or nil when they are
// not configured (no knowledgeDb in config.yaml).
func NewService(ctx context.Context, cfg *config.Config, s3Client *s3.Client, log *logger.Logger) (*Service, error) {
	if !cfg.KnowledgeDB.Enabled() {
		log.Infof("Knowledge bases disabled: no knowledgeDb in the configuration")
		return nil, nil
	}
	store, err := NewStore(ctx, cfg.KnowledgeDB.DSN())
	if err != nil {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	return &Service{
		cfg:      cfg.Rag,
		store:    store,
		s3:       s3Client,
		bucket:   cfg.AwsS3.Bucket,
		log:      log,
		tokenKey: key,
	}, nil
}

// SetGPUPolicy sets which groups' embeddings run on this replica's GPU:
// the platform's GPU policy (organization and group) and the replica
// having a usable GPU (flows_manager).
func (s *Service) SetGPUPolicy(gpuForGroup func(groupID int) bool) {
	s.policyMu.Lock()
	s.gpuForGroup = gpuForGroup
	s.policyMu.Unlock()
}

// SetRAGPolicy sets which groups have their knowledge base enabled (the
// organization's and the group's setting, flows_manager). The others are
// neither indexed nor searched.
func (s *Service) SetRAGPolicy(ragForGroup func(groupID int) bool) {
	s.policyMu.Lock()
	s.ragForGroup = ragForGroup
	s.policyMu.Unlock()
}

// Enabled reports whether a group's knowledge base is enabled.
func (s *Service) Enabled(groupID int) bool {
	s.policyMu.Lock()
	policy := s.ragForGroup
	s.policyMu.Unlock()
	return policy != nil && policy(groupID)
}

// providerFor is where a group's embeddings run on this replica.
func (s *Service) providerFor(groupID int) string {
	s.policyMu.Lock()
	policy := s.gpuForGroup
	s.policyMu.Unlock()
	if policy != nil && policy(groupID) && nodes.GPUUsable() {
		return nodes.ProviderCUDA
	}
	return nodes.ProviderCPU
}

// Preload loads, in the background, the embedders the groups will use on
// this replica, so that the first search (or indexing) does not wait for
// the model. Replicas with no enabled knowledge base load nothing.
func (s *Service) Preload(groupIDs []int) {
	providers := map[string]bool{}
	for _, id := range groupIDs {
		if s.Enabled(id) {
			providers[s.providerFor(id)] = true
		}
	}
	for provider := range providers {
		go func() {
			if _, err := s.getEmbedder(provider); err != nil {
				s.log.Errorf("Knowledge bases: %v", err)
			}
		}()
	}
}

// getEmbedder returns the provider's embedder, loading its model on first
// use: replicas without an enabled knowledge base do not spend its
// memory. Once loaded it stays.
func (s *Service) getEmbedder(provider string) (*Embedder, error) {
	s.embedMu.Lock()
	defer s.embedMu.Unlock()
	if e := s.embedders[provider]; e != nil {
		return e, nil
	}
	e, err := NewEmbedder(s.cfg.ModelDir, provider, s.log)
	if err != nil {
		return nil, err
	}
	if s.embedders == nil {
		s.embedders = map[string]*Embedder{}
	}
	s.embedders[provider] = e
	return e, nil
}

// embed runs fn with the embedder of a group: on CUDA when the group may
// use this replica's GPU, falling back to CPU if CUDA fails.
func (s *Service) embed(groupID int, fn func(*Embedder) ([][]float32, error)) ([][]float32, error) {
	provider := s.providerFor(groupID)
	for {
		e, err := s.getEmbedder(provider)
		var vectors [][]float32
		if err == nil {
			vectors, err = fn(e)
		}
		switch {
		case err == nil:
			return vectors, nil
		case provider == nodes.ProviderCUDA:
			if nodes.IsStickyCUDAError(err) {
				nodes.MarkCUDABroken(err, s.log)
			}
			s.log.Warnf("Knowledge bases: embeddings on CUDA failed (%v); using the CPU", err)
			provider = nodes.ProviderCPU
		default:
			return nil, err
		}
	}
}

// Ready reports whether the database side is usable (and prepares it).
func (s *Service) Ready(ctx context.Context) error {
	return s.store.Ready(ctx)
}

// ── Indexing ──────────────────────────────────────────────────────────

// IndexDocument indexes one document of a group's knowledge base, unless
// it is already indexed in its current version. Returns whether it did
// any work.
func (s *Service) IndexDocument(ctx context.Context, orgID, groupID int, fileName string) (bool, error) {
	if err := s.store.Ready(ctx); err != nil {
		return false, err
	}
	key := KnowledgePrefix(orgID, groupID) + fileName

	head, err := s.s3.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return false, fmt.Errorf("error reading s3://%s/%s: %w", s.bucket, key, err)
	}
	lastModified := aws.ToTime(head.LastModified).UTC().Format(time.RFC3339Nano)

	if doc, err := s.store.GetDocument(ctx, key); err != nil {
		return false, err
	} else if doc != nil && doc.LastModified == lastModified && doc.Status == StatusReady {
		return false, nil // already indexed in this version
	}

	docID, err := s.store.MarkIndexing(ctx, Document{
		OrgID: orgID, GroupID: groupID, S3Key: key, FileName: fileName, LastModified: lastModified,
	})
	if err != nil {
		return false, err
	}
	n, err := s.indexDocument(ctx, groupID, key, fileName, docID)
	if err != nil {
		if markErr := s.store.MarkError(context.WithoutCancel(ctx), docID, err); markErr != nil {
			s.log.Errorf("Knowledge base of group %d: %v", groupID, markErr)
		}
		return true, err
	}
	s.log.Infof("Knowledge base of group %d: %s indexed (%d chunks)", groupID, fileName, n)
	return true, nil
}

func (s *Service) indexDocument(ctx context.Context, groupID int, key, fileName string, docID int64) (int, error) {
	if !SupportedExtension(fileName) {
		return 0, fmt.Errorf("%w: %s", ErrUnsupportedFormat, path.Ext(fileName))
	}
	// How long each step takes, in the log line of the document: where
	// the time (and the CPU) of an indexing goes.
	timer := newStepTimer()
	data, found, err := utils.GetS3Object(ctx, s.s3, s.bucket, key)
	if err != nil {
		return 0, err
	}
	if !found {
		return 0, fmt.Errorf("s3://%s/%s not found", s.bucket, key)
	}
	if len(data) > maxDocumentBytes {
		return 0, fmt.Errorf("document too large (%d MB, at most %d MB)", len(data)>>20, maxDocumentBytes>>20)
	}

	size := len(data)
	timer.step("download")
	sections, err := ExtractText(ctx, fileName, data)
	if err != nil {
		return 0, err
	}
	data = nil
	timer.step("extract")
	chunks := SplitIntoChunks(sections)
	if len(chunks) == 0 {
		return 0, errors.New("the document has no text")
	}

	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Content
	}
	timer.step("chunk")
	var provider string
	vectors, err := s.embed(groupID, func(e *Embedder) ([][]float32, error) {
		provider = e.Provider()
		return e.EmbedPassages(texts)
	})
	if err != nil {
		return 0, err
	}
	timer.step("embed")
	if err := s.store.ReplaceChunks(ctx, docID, groupID, chunks, vectors); err != nil {
		return 0, err
	}
	timer.step("store")
	s.log.Infof("Knowledge base of group %d: %s (%d KB): %d chunks, embeddings on %s; %s",
		groupID, fileName, size>>10, len(texts), provider, timer)
	return len(chunks), nil
}

// stepTimer times the steps of an indexing, in wall time and CPU time:
// "extract 2.8s (cpu 2.7s), embed 11.4s (cpu 10.9s), ...". CPU time is the
// whole process's and its child processes' (pdftotext): the work of the
// step, plus whatever else pipelines did meanwhile. CPU close to the wall
// time is a core kept busy (on CUDA, mostly waiting for the GPU). The
// embed step includes loading the model when it was not loaded (see the
// "loaded ... in" line).
type stepTimer struct {
	start, last       time.Time
	cpuStart, cpuLast time.Duration
	cpuOK             bool
	steps             []string
}

func newStepTimer() *stepTimer {
	now := time.Now()
	cpu, ok := processCPUTime()
	return &stepTimer{start: now, last: now, cpuStart: cpu, cpuLast: cpu, cpuOK: ok}
}

func (t *stepTimer) step(name string) {
	now := time.Now()
	s := fmt.Sprintf("%s %s", name, now.Sub(t.last).Round(time.Millisecond))
	if cpu, ok := processCPUTime(); ok && t.cpuOK {
		s += fmt.Sprintf(" (cpu %s)", (cpu - t.cpuLast).Round(time.Millisecond))
		t.cpuLast = cpu
	}
	t.steps = append(t.steps, s)
	t.last = now
}

func (t *stepTimer) String() string {
	total := fmt.Sprintf("total %s", t.last.Sub(t.start).Round(time.Millisecond))
	if t.cpuOK {
		total += fmt.Sprintf(", cpu %s", (t.cpuLast - t.cpuStart).Round(time.Millisecond))
	}
	return fmt.Sprintf("%s (%s)", strings.Join(t.steps, ", "), total)
}

// DeleteDocument removes a document from a group's knowledge base.
func (s *Service) DeleteDocument(ctx context.Context, orgID, groupID int, fileName string) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	return s.store.DeleteDocument(ctx, KnowledgePrefix(orgID, groupID)+fileName)
}

// DeleteGroup removes a group's knowledge base from the database.
func (s *Service) DeleteGroup(ctx context.Context, groupID int) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	return s.store.DeleteGroup(ctx, groupID)
}

// GroupFiles lists the documents of a group's knowledge base in the
// bucket (file names).
func (s *Service) GroupFiles(ctx context.Context, orgID, groupID int) ([]string, error) {
	prefix := KnowledgePrefix(orgID, groupID)
	var names []string
	paginator := s3.NewListObjectsV2Paginator(s.s3, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("error listing s3://%s/%s: %w", s.bucket, prefix, err)
		}
		for _, obj := range page.Contents {
			name := strings.TrimPrefix(aws.ToString(obj.Key), prefix)
			if name != "" && !strings.Contains(name, "/") {
				names = append(names, name)
			}
		}
	}
	return names, nil
}

// ReconcileGroup makes a group's index match its bucket folder: indexes
// what is missing or changed, removes what is gone. lock is taken around
// each document (several replicas may reconcile at once).
func (s *Service) ReconcileGroup(ctx context.Context, orgID, groupID int, lock func(key string) (func(), bool)) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	files, err := s.GroupFiles(ctx, orgID, groupID)
	if err != nil {
		return err
	}
	inBucket := map[string]bool{}
	for _, name := range files {
		key := KnowledgePrefix(orgID, groupID) + name
		inBucket[key] = true
		release, ok := lock(key)
		if !ok {
			continue
		}
		_, err := s.IndexDocument(ctx, orgID, groupID, name)
		release()
		if err != nil {
			s.log.Errorf("Knowledge base of group %d: %s: %v", groupID, name, err)
		}
	}
	indexed, err := s.store.GroupDocuments(ctx, groupID)
	if err != nil {
		return err
	}
	for _, key := range indexed {
		if !inBucket[key] {
			if err := s.store.DeleteDocument(ctx, key); err != nil {
				return err
			}
		}
	}
	return nil
}

// DeleteGroupsNotIn removes the knowledge bases of the groups not in
// groupIDs: deleted, or with their knowledge base disabled.
func (s *Service) DeleteGroupsNotIn(ctx context.Context, groupIDs []int) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	n, err := s.store.DeleteGroupsNotIn(ctx, groupIDs)
	if n > 0 {
		s.log.Infof("Knowledge bases: removed %d documents of deleted groups or groups with the knowledge base disabled", n)
	}
	return err
}

// ── Search ────────────────────────────────────────────────────────────

// DigitalTwinDocuments returns the documents a digital twin's agents may
// read, with their titles: none when its group's knowledge base is not
// enabled.
func (s *Service) DigitalTwinDocuments(ctx context.Context, groupID, digitalTwinID int) ([]AllowedDocument, error) {
	if !s.Enabled(groupID) {
		return nil, nil
	}
	if err := s.store.Ready(ctx); err != nil {
		return nil, err
	}
	return s.store.DigitalTwinDocuments(ctx, groupID, digitalTwinID)
}

// Search returns the best chunks for a question among the documents a
// digital twin's agents may read.
func (s *Service) Search(ctx context.Context, groupID, digitalTwinID int, query string, topK int) ([]SearchResult, error) {
	docs, err := s.DigitalTwinDocuments(ctx, groupID, digitalTwinID)
	if err != nil {
		return nil, err
	}
	var ids []int64
	titles := map[string]string{}
	for _, d := range docs {
		if d.Status == StatusReady && d.DocumentID != 0 {
			ids = append(ids, d.DocumentID)
		}
		titles[d.FileName] = d.Title
	}
	if len(ids) == 0 {
		return nil, nil
	}
	// The same embedder as the group's documents (same model file), so
	// that questions and passages are compared in the same space.
	vectors, err := s.embed(groupID, func(e *Embedder) ([][]float32, error) {
		v, err := e.EmbedQuery(query)
		if err != nil {
			return nil, err
		}
		return [][]float32{v}, nil
	})
	if err != nil {
		return nil, err
	}
	results, err := s.store.Search(ctx, groupID, ids, query, vectors[0], topK)
	for i := range results {
		results[i].Title = titles[results[i].FileName]
	}
	return results, err
}

// DigitalTwinToken is what a digital twin's doc_info server must present
// to list and search its documents: an HMAC of the group and digital twin
// ids with a key that only this process knows (new at every start, so
// tokens die with it). It can reach that digital twin's documents only.
func (s *Service) DigitalTwinToken(groupID, digitalTwinID int) string {
	mac := hmac.New(sha256.New, s.tokenKey)
	mac.Write([]byte("knowledge-dt:" + strconv.Itoa(groupID) + ":" + strconv.Itoa(digitalTwinID)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Service) validToken(groupID, digitalTwinID int, token string) bool {
	return hmac.Equal([]byte(s.DigitalTwinToken(groupID, digitalTwinID)), []byte(token))
}

// BaseURL is the endpoint the doc_info servers call: /documents and
// /search under it.
func (s *Service) BaseURL() string {
	return "http://" + s.cfg.SearchAddr + "/v1/knowledge"
}

// knowledgeRequest is what doc_info sends: the digital twin, its token,
// and, to search, the question.
type knowledgeRequest struct {
	GroupID       int    `json:"group_id"`
	DigitalTwinID int    `json:"digital_twin_id"`
	Token         string `json:"token"`
	Query         string `json:"query,omitempty"`
	TopK          int    `json:"top_k,omitempty"`
}

type searchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error,omitempty"`
}

type documentsResponse struct {
	Documents []AllowedDocument `json:"documents"`
	Error     string            `json:"error,omitempty"`
}

// StartSearchServer serves the searches on the loopback interface only:
// it is reachable from the processes of this container (the agents'
// doc_info servers), not from the network.
func (s *Service) StartSearchServer(ctx context.Context) error {
	host, _, err := net.SplitHostPort(s.cfg.SearchAddr)
	if err != nil {
		return fmt.Errorf("rag.searchAddr %q: %w", s.cfg.SearchAddr, err)
	}
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return fmt.Errorf("rag.searchAddr %q must be a loopback address", s.cfg.SearchAddr)
	}
	ln, err := net.Listen("tcp", s.cfg.SearchAddr)
	if err != nil {
		return fmt.Errorf("knowledge search endpoint: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/knowledge/search", s.handleSearch)
	mux.HandleFunc("POST /v1/knowledge/documents", s.handleDocuments)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.log.Errorf("Knowledge search endpoint stopped: %v", err)
		}
	}()
	s.log.Infof("Knowledge search endpoint listening on %s", s.cfg.SearchAddr)
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// readKnowledgeRequest decodes a request and checks its token; "" when
// it is valid, the error otherwise.
func (s *Service) readKnowledgeRequest(w http.ResponseWriter, r *http.Request, req *knowledgeRequest) (int, string) {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(req); err != nil {
		return http.StatusBadRequest, "invalid request"
	}
	if !s.validToken(req.GroupID, req.DigitalTwinID, req.Token) {
		return http.StatusForbidden, "invalid token for this digital twin"
	}
	return 0, ""
}

func (s *Service) handleDocuments(w http.ResponseWriter, r *http.Request) {
	var req knowledgeRequest
	if status, msg := s.readKnowledgeRequest(w, r, &req); msg != "" {
		writeJSON(w, status, documentsResponse{Error: msg})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	docs, err := s.DigitalTwinDocuments(ctx, req.GroupID, req.DigitalTwinID)
	if err != nil {
		s.log.Errorf("Knowledge documents (digital twin %d): %v", req.DigitalTwinID, err)
		writeJSON(w, http.StatusInternalServerError, documentsResponse{Error: err.Error()})
		return
	}
	if docs == nil {
		docs = []AllowedDocument{}
	}
	writeJSON(w, http.StatusOK, documentsResponse{Documents: docs})
}

func (s *Service) handleSearch(w http.ResponseWriter, r *http.Request) {
	reply := func(status int, resp searchResponse) { writeJSON(w, status, resp) }
	var req knowledgeRequest
	if status, msg := s.readKnowledgeRequest(w, r, &req); msg != "" {
		reply(status, searchResponse{Error: msg})
		return
	}
	req.Query = strings.TrimSpace(req.Query)
	if req.Query == "" {
		reply(http.StatusBadRequest, searchResponse{Error: "empty query"})
		return
	}
	if req.TopK <= 0 || req.TopK > 20 {
		req.TopK = 6
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	results, err := s.Search(ctx, req.GroupID, req.DigitalTwinID, req.Query, req.TopK)
	if err != nil {
		s.log.Errorf("Knowledge search (digital twin %d): %v", req.DigitalTwinID, err)
		reply(http.StatusInternalServerError, searchResponse{Error: err.Error()})
		return
	}
	reply(http.StatusOK, searchResponse{Results: results})
}
