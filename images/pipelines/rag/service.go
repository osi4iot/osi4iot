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
	"pipelines/utils"
)

// Knowledge bases (RAG)
//
// Every group has a knowledge base: the documents its administrators
// upload to org_data/org_<org>/group_<group>/knowledge/ in the bucket
// (admin_api). Pipelines indexes them in the rag schema of patroni_admin
// (text, then chunks, then embeddings) and answers searches over them
// for the group's AI agents, through an HTTP endpoint on the loopback
// interface that the agents' doc_info MCP servers call.

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

	embedderOnce sync.Once
	embedder     *Embedder
	embedderErr  error

	tokenKey []byte // signs the per-group search tokens
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

// Embedder loads the model on first use: replicas that never index or
// search do not spend its memory.
func (s *Service) getEmbedder() (*Embedder, error) {
	s.embedderOnce.Do(func() {
		s.embedder, s.embedderErr = NewEmbedder(s.cfg.ModelDir, s.log)
	})
	return s.embedder, s.embedderErr
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

	sections, err := ExtractText(ctx, fileName, data)
	if err != nil {
		return 0, err
	}
	data = nil
	chunks := SplitIntoChunks(sections)
	if len(chunks) == 0 {
		return 0, errors.New("the document has no text")
	}

	embedder, err := s.getEmbedder()
	if err != nil {
		return 0, err
	}
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Content
	}
	vectors, err := embedder.EmbedPassages(texts)
	if err != nil {
		return 0, err
	}
	if err := s.store.ReplaceChunks(ctx, docID, groupID, chunks, vectors); err != nil {
		return 0, err
	}
	return len(chunks), nil
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

// DeleteGroupsNotIn removes the knowledge bases of deleted groups.
func (s *Service) DeleteGroupsNotIn(ctx context.Context, groupIDs []int) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	n, err := s.store.DeleteGroupsNotIn(ctx, groupIDs)
	if n > 0 {
		s.log.Infof("Knowledge bases: removed %d documents of deleted groups", n)
	}
	return err
}

// ── Search ────────────────────────────────────────────────────────────

// Search returns a group's best chunks for a question.
func (s *Service) Search(ctx context.Context, groupID int, query string, topK int) ([]SearchResult, error) {
	if err := s.store.Ready(ctx); err != nil {
		return nil, err
	}
	embedder, err := s.getEmbedder()
	if err != nil {
		return nil, err
	}
	vector, err := embedder.EmbedQuery(query)
	if err != nil {
		return nil, err
	}
	return s.store.Search(ctx, groupID, query, vector, topK)
}

// GroupToken is what an agent's doc_info server must present to search
// a group's knowledge base: an HMAC of the group id with a key that only
// this process knows (new at every start, so tokens die with it).
func (s *Service) GroupToken(groupID int) string {
	mac := hmac.New(sha256.New, s.tokenKey)
	mac.Write([]byte("knowledge-group:" + strconv.Itoa(groupID)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Service) validToken(groupID int, token string) bool {
	return hmac.Equal([]byte(s.GroupToken(groupID)), []byte(token))
}

// SearchURL is the endpoint the doc_info servers call.
func (s *Service) SearchURL() string {
	return "http://" + s.cfg.SearchAddr + "/v1/knowledge/search"
}

type searchRequest struct {
	GroupID int    `json:"group_id"`
	Token   string `json:"token"`
	Query   string `json:"query"`
	TopK    int    `json:"top_k"`
}

type searchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error,omitempty"`
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

func (s *Service) handleSearch(w http.ResponseWriter, r *http.Request) {
	reply := func(status int, resp searchResponse) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(resp)
	}
	var req searchRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		reply(http.StatusBadRequest, searchResponse{Error: "invalid request"})
		return
	}
	if !s.validToken(req.GroupID, req.Token) {
		reply(http.StatusForbidden, searchResponse{Error: "invalid token for this group"})
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
	results, err := s.Search(ctx, req.GroupID, req.Query, req.TopK)
	if err != nil {
		s.log.Errorf("Knowledge search (group %d): %v", req.GroupID, err)
		reply(http.StatusInternalServerError, searchResponse{Error: err.Error()})
		return
	}
	reply(http.StatusOK, searchResponse{Results: results})
}
