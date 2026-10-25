// doc_info is the MCP server that gives a digital twin's AI agents read
// access to the documents of its group's knowledge base that the digital
// twin may read (chosen in the digital twin; none unless chosen), read
// straight from the bucket. Nothing is copied to the pipelines' disk, and
// the agent cannot write them.
//
// Usage: doc_info --prefix org_data/org_1/group_1/knowledge/ --group_id 1 --digital_twin_id 5
//
//	--knowledge_url http://127.0.0.1:7071/v1/knowledge --knowledge_token …
//
// pipelines starts it only when the group's knowledge base is enabled and
// the digital twin may read some of its documents. Which ones, and their
// titles, it asks pipelines' loopback endpoint (…/documents) on every
// call, with the token pipelines gives it, valid for this digital twin
// only: a document removed from the digital twin, or a title changed,
// counts at once.
//
// list-documents lists them (title, file name, size, date, indexing),
// read-document reads one as text (text, PDF with pdftotext, Word .docx)
// and search-knowledge searches them (…/search: meaning and keywords,
// over what pipelines indexed).
//
// The bucket comes from the environment pipelines passes on:
// MCP_S3_BUCKET, MCP_S3_REGION, MCP_S3_ACCESS_KEY_ID,
// MCP_S3_SECRET_ACCESS_KEY and MCP_S3_ENDPOINT (empty for AWS S3,
// http://garage:3900 for Garage).
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"pipelines/rag/extract"
)

const (
	defaultMaxChars = 50000     // per read-document call
	maxDocumentSize = 100 << 20 // as admin_api accepts them
)

type docStore struct {
	client *s3.Client
	bucket string
	prefix string
	kb     *knowledgeClient

	// Extracted text by S3 key and version: reading a long PDF in parts
	// runs pdftotext once, not once per part.
	mu    sync.Mutex
	texts map[string]cachedText
}

type cachedText struct {
	lastModified time.Time
	text         string
}

type document struct {
	Name         string // file name
	Title        string // the file name when it has no title
	Status       string // indexing: pending, indexing, ready, error
	Key          string
	Size         int64
	LastModified time.Time
}

func main() {
	var prefix string
	kb := &knowledgeClient{}
	flag.StringVar(&prefix, "prefix", "", "S3 prefix of the group's knowledge base (…/group_<id>/knowledge/)")
	flag.IntVar(&kb.groupID, "group_id", 0, "Group of the digital twin")
	flag.IntVar(&kb.digitalTwinID, "digital_twin_id", 0, "Digital twin whose documents are read")
	flag.StringVar(&kb.url, "knowledge_url", "", "pipelines' knowledge endpoint (…/v1/knowledge)")
	flag.StringVar(&kb.token, "knowledge_token", "", "Token for the digital twin's documents")
	flag.Parse()
	if prefix == "" {
		log.Fatal("--prefix is required")
	}
	if kb.url == "" || kb.token == "" || kb.groupID <= 0 || kb.digitalTwinID <= 0 {
		log.Fatal("--group_id, --digital_twin_id, --knowledge_url and --knowledge_token are required")
	}
	kb.url = strings.TrimSuffix(kb.url, "/")
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	store, err := newDocStore(context.Background(), prefix, kb)
	if err != nil {
		log.Fatal(err)
	}

	s := server.NewMCPServer(
		"documents",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions("Read the documents this digital twin has access to: manuals, procedures, "+
			"specifications, reports. Each document has a title, which says what it is about, and a file name."),
	)

	s.AddTool(mcp.NewTool("list-documents",
		mcp.WithDescription("List the documents you have access to: their title, file name, size and date."),
	), store.handleList)

	s.AddTool(mcp.NewTool("read-document",
		mcp.WithDescription(fmt.Sprintf(
			"Read a whole document as text (text, PDF or Word). Long documents are returned in parts of up "+
				"to %d characters: call again with the 'offset' given at the end of the previous part. To find "+
				"information, search first; read a document when you need all of it or the context around a "+
				"passage.", defaultMaxChars)),
		mcp.WithString("name", mcp.Description("The document's file name (or its title), as list-documents shows it"), mcp.Required()),
		mcp.WithNumber("offset", mcp.Description("Character offset to start reading from (default 0)")),
	), store.handleRead)

	s.AddTool(mcp.NewTool("search-knowledge",
		mcp.WithDescription("Search the documents you have access to (manuals, procedures, specifications, "+
			"reports) for information relevant to a question. Finds passages by meaning and by exact terms "+
			"(codes, references, names). Returns the most relevant passages with their document and page or "+
			"section: cite them in your answer."),
		mcp.WithString("query", mcp.Description("The question or topic to look up, in natural language"), mcp.Required()),
		mcp.WithNumber("top_k", mcp.Description("How many passages to return (default 6, at most 20)")),
	), kb.handleSearch)

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func newDocStore(ctx context.Context, prefix string, kb *knowledgeClient) (*docStore, error) {
	bucket := os.Getenv("MCP_S3_BUCKET")
	if bucket == "" {
		return nil, errors.New("MCP_S3_BUCKET is not set")
	}
	region := os.Getenv("MCP_S3_REGION")
	if region == "" {
		region = "us-east-1"
	}
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			os.Getenv("MCP_S3_ACCESS_KEY_ID"), os.Getenv("MCP_S3_SECRET_ACCESS_KEY"), "")),
	)
	if err != nil {
		return nil, fmt.Errorf("error loading the S3 configuration: %w", err)
	}
	endpoint := strings.TrimSpace(os.Getenv("MCP_S3_ENDPOINT"))
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			// Garage: path-style, and checksums only where required (see
			// utils.CreateS3Client in pipelines).
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
			o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
			o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		}
	})
	return &docStore{client: client, bucket: bucket, prefix: prefix, kb: kb, texts: map[string]cachedText{}}, nil
}

// list returns the documents the digital twin may read (pipelines says
// which, with their titles), with their size and date from the bucket.
// One not in the bucket (deleted meanwhile) is left out.
func (d *docStore) list(ctx context.Context) ([]document, error) {
	allowed, err := d.kb.documents(ctx)
	if err != nil {
		return nil, err
	}
	if len(allowed) == 0 {
		return nil, nil
	}
	inBucket := map[string]types.Object{}
	paginator := s3.NewListObjectsV2Paginator(d.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(d.bucket),
		Prefix: aws.String(d.prefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("error listing the documents: %w", err)
		}
		for _, obj := range page.Contents {
			inBucket[strings.TrimPrefix(aws.ToString(obj.Key), d.prefix)] = obj
		}
	}
	var docs []document
	for _, a := range allowed {
		obj, ok := inBucket[a.File]
		if !ok || a.File == "" || strings.Contains(a.File, "/") || !extract.SupportedExtension(a.File) {
			continue
		}
		title := strings.TrimSpace(a.Title)
		if title == "" {
			title = a.File
		}
		docs = append(docs, document{
			Name:         a.File,
			Title:        title,
			Status:       a.Status,
			Key:          aws.ToString(obj.Key),
			Size:         aws.ToInt64(obj.Size),
			LastModified: aws.ToTime(obj.LastModified),
		})
	}
	sort.Slice(docs, func(i, j int) bool {
		if docs[i].Title != docs[j].Title {
			return docs[i].Title < docs[j].Title
		}
		return docs[i].Name < docs[j].Name
	})
	return docs, nil
}

// readText reads a document and returns it as text (extracted, for PDF
// and Word), or an error if it is too large or cannot be read.
func (d *docStore) readText(ctx context.Context, doc document) (string, error) {
	if doc.Size > maxDocumentSize {
		return "", fmt.Errorf("document %q is too large to read (%d MB)", doc.Name, doc.Size>>20)
	}
	d.mu.Lock()
	cached, ok := d.texts[doc.Key]
	d.mu.Unlock()
	if ok && cached.lastModified.Equal(doc.LastModified) {
		return cached.text, nil
	}

	out, err := d.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(d.bucket), Key: aws.String(doc.Key)})
	if err != nil {
		var noKey *types.NoSuchKey
		if errors.As(err, &noKey) {
			return "", fmt.Errorf("document %q not found", doc.Name)
		}
		return "", fmt.Errorf("error reading document %q: %w", doc.Name, err)
	}
	defer out.Body.Close()
	data, err := io.ReadAll(io.LimitReader(out.Body, maxDocumentSize+1))
	if err != nil {
		return "", fmt.Errorf("error reading document %q: %w", doc.Name, err)
	}
	sections, err := extract.Text(ctx, doc.Name, data)
	if err != nil {
		return "", fmt.Errorf("document %q cannot be read: %w", doc.Name, err)
	}
	var b strings.Builder
	for _, sec := range sections {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		if sec.Location != "" {
			fmt.Fprintf(&b, "[%s]\n", sec.Location)
		}
		b.WriteString(strings.TrimSpace(sec.Text))
	}
	text := b.String()

	d.mu.Lock()
	d.texts[doc.Key] = cachedText{lastModified: doc.LastModified, text: text}
	d.mu.Unlock()
	return text, nil
}

func (d *docStore) find(ctx context.Context, name string) (document, error) {
	docs, err := d.list(ctx)
	if err != nil {
		return document{}, err
	}
	// By file name first; then by title, if only one has it.
	for _, doc := range docs {
		if doc.Name == name {
			return doc, nil
		}
	}
	var byTitle []document
	for _, doc := range docs {
		if strings.EqualFold(doc.Title, strings.TrimSpace(name)) {
			byTitle = append(byTitle, doc)
		}
	}
	if len(byTitle) == 1 {
		return byTitle[0], nil
	}
	if len(byTitle) > 1 {
		return document{}, fmt.Errorf("several documents are titled %q: give the file name", name)
	}
	return document{}, fmt.Errorf("document %q not found; use list-documents to see the available ones", name)
}

func (d *docStore) handleList(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	docs, err := d.list(ctx)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(docs) == 0 {
		return mcp.NewToolResultText("You have access to no documents."), nil
	}
	var b strings.Builder
	b.WriteString("title\tfile\tsize\tdate\n")
	for _, doc := range docs {
		fmt.Fprintf(&b, "%s\t%s\t%s\t%s", doc.Title, doc.Name, humanSize(doc.Size), doc.LastModified.UTC().Format("2006-01-02 15:04"))
		if doc.Status != "ready" {
			// Readable, but not found by search-knowledge yet (or at all).
			fmt.Fprintf(&b, "\t(not searchable: %s)", doc.Status)
		}
		b.WriteString("\n")
	}
	return mcp.NewToolResultText(b.String()), nil
}

func (d *docStore) handleRead(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	if name == "" {
		return mcp.NewToolResultError("missing 'name'"), nil
	}
	offset := 0
	if v, ok := args["offset"].(float64); ok && v > 0 {
		offset = int(v)
	}

	doc, err := d.find(ctx, name)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	text, err := d.readText(ctx, doc)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	runes := []rune(text)
	if offset >= len(runes) {
		return mcp.NewToolResultText(fmt.Sprintf("[end of %s: it has %d characters]", name, len(runes))), nil
	}
	end := offset + defaultMaxChars
	if end > len(runes) {
		end = len(runes)
	}
	part := string(runes[offset:end])
	if end < len(runes) {
		part += fmt.Sprintf("\n\n[%s continues: characters %d-%d of %d shown; read again with offset=%d]",
			name, offset, end, len(runes), end)
	}
	return mcp.NewToolResultText(part), nil
}

func humanSize(n int64) string {
	switch {
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(n)/(1<<10))
	default:
		return fmt.Sprintf("%d B", n)
	}
}

// knowledgeClient calls pipelines' knowledge endpoint for the digital
// twin's documents.
type knowledgeClient struct {
	groupID       int
	digitalTwinID int
	url           string
	token         string
}

type knowledgeResult struct {
	File     string  `json:"file"`
	Title    string  `json:"title"`
	Location string  `json:"location"`
	Content  string  `json:"content"`
	Score    float64 `json:"score"`
}

type allowedDocument struct {
	File   string `json:"file"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// call posts a request to the endpoint path (documents, search) and
// decodes the answer into out, which has an "error" field.
func (k *knowledgeClient) call(ctx context.Context, path string, extra map[string]any, out any, errField *string) error {
	body := map[string]any{
		"group_id":        k.groupID,
		"digital_twin_id": k.digitalTwinID,
		"token":           k.token,
	}
	for key, v := range extra {
		body[key] = v
	}
	data, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, k.url+"/"+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("the knowledge base is not reachable: %w", err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(out); err != nil {
		return fmt.Errorf("invalid answer from the knowledge base (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("knowledge base: %s", *errField)
	}
	return nil
}

// documents returns the documents the digital twin may read.
func (k *knowledgeClient) documents(ctx context.Context) ([]allowedDocument, error) {
	var out struct {
		Documents []allowedDocument `json:"documents"`
		Error     string            `json:"error"`
	}
	if err := k.call(ctx, "documents", nil, &out, &out.Error); err != nil {
		return nil, err
	}
	return out.Documents, nil
}

func (k *knowledgeClient) handleSearch(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	query, _ := args["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return mcp.NewToolResultError("missing 'query'"), nil
	}
	topK := 6
	if v, ok := args["top_k"].(float64); ok && v > 0 {
		topK = int(v)
	}

	var out struct {
		Results []knowledgeResult `json:"results"`
		Error   string            `json:"error"`
	}
	if err := k.call(ctx, "search", map[string]any{"query": query, "top_k": topK}, &out, &out.Error); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(out.Results) == 0 {
		return mcp.NewToolResultText(fmt.Sprintf("Nothing relevant to %q in your documents.", query)), nil
	}

	var b strings.Builder
	for i, r := range out.Results {
		source := r.File
		if r.Title != "" && r.Title != r.File {
			source = fmt.Sprintf("%s (%s)", r.Title, r.File)
		}
		if r.Location != "" {
			source += ", " + r.Location
		}
		fmt.Fprintf(&b, "[%d] %s\n%s\n\n", i+1, source, strings.TrimSpace(r.Content))
	}
	return mcp.NewToolResultText(b.String()), nil
}
