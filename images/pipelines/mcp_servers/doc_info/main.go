// doc_info is the MCP server that gives an AI agent read access to its
// group's knowledge base: the documents the group's administrators
// upload (Group admin → Knowledge), read straight from the bucket.
// Nothing is copied to the pipelines' disk, and the agent cannot write
// them.
//
// Usage: doc_info --prefix org_data/org_1/group_1/knowledge/
//
//	[--group_id 1 --knowledge_url http://127.0.0.1:7071/v1/knowledge/search --knowledge_token …]
//
// list-documents and read-document work on the files themselves: text,
// PDF (with pdftotext) and Word .docx are read as text. With the
// knowledge_* flags it also offers search-knowledge, the search over the
// knowledge base that pipelines indexes (meaning and keywords) and
// answers on its loopback endpoint; the token, valid for this group
// only, is given by pipelines when it starts the agent. Without them
// (a platform with no knowledge database) it offers search-documents
// instead: a plain text search over the documents.
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
	maxSearchHits   = 50
)

type docStore struct {
	client *s3.Client
	bucket string
	prefix string

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
	Name         string
	Key          string
	Size         int64
	LastModified time.Time
}

func main() {
	var prefix string
	var kb knowledgeClient
	flag.StringVar(&prefix, "prefix", "", "S3 prefix of the group's knowledge base (…/group_<id>/knowledge/)")
	flag.IntVar(&kb.groupID, "group_id", 0, "Group whose knowledge base search-knowledge searches")
	flag.StringVar(&kb.url, "knowledge_url", "", "pipelines' knowledge search endpoint")
	flag.StringVar(&kb.token, "knowledge_token", "", "Token for the group's knowledge base")
	flag.Parse()
	if prefix == "" {
		log.Fatal("--prefix is required")
	}
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	store, err := newDocStore(context.Background(), prefix)
	if err != nil {
		log.Fatal(err)
	}

	s := server.NewMCPServer(
		"documents",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions("Read the documents of the group's knowledge base: manuals, procedures, specifications, reports."),
	)

	s.AddTool(mcp.NewTool("list-documents",
		mcp.WithDescription("List the documents of the group's knowledge base, with their size and date."),
	), store.handleList)

	s.AddTool(mcp.NewTool("read-document",
		mcp.WithDescription(fmt.Sprintf(
			"Read a whole document of the knowledge base as text (text, PDF or Word). Long documents are "+
				"returned in parts of up to %d characters: call again with the 'offset' given at the end "+
				"of the previous part. To find information, search first; read a document when you need "+
				"all of it or the context around a passage.", defaultMaxChars)),
		mcp.WithString("name", mcp.Description("Document name, as list-documents shows it"), mcp.Required()),
		mcp.WithNumber("offset", mcp.Description("Character offset to start reading from (default 0)")),
	), store.handleRead)

	if kb.url == "" || kb.token == "" || kb.groupID <= 0 {
		// No knowledge database: a plain text search over the documents.
		s.AddTool(mcp.NewTool("search-documents",
			mcp.WithDescription("Search the documents for a word or phrase (case-insensitive). "+
				"Returns the matching lines with their document and line number."),
			mcp.WithString("query", mcp.Description("Text to search for"), mcp.Required()),
		), store.handleSearch)
	} else {
		s.AddTool(mcp.NewTool("search-knowledge",
			mcp.WithDescription("Search the group's knowledge base (manuals, procedures, specifications, reports "+
				"shared by the whole group) for information relevant to a question. Finds passages by meaning "+
				"and by exact terms (codes, references, names). Returns the most relevant passages with their "+
				"document and page or section: cite them in your answer."),
			mcp.WithString("query", mcp.Description("The question or topic to look up, in natural language"), mcp.Required()),
			mcp.WithNumber("top_k", mcp.Description("How many passages to return (default 6, at most 20)")),
		), kb.handleSearch)
	}

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func newDocStore(ctx context.Context, prefix string) (*docStore, error) {
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
	return &docStore{client: client, bucket: bucket, prefix: prefix, texts: map[string]cachedText{}}, nil
}

func (d *docStore) list(ctx context.Context) ([]document, error) {
	var docs []document
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
			key := aws.ToString(obj.Key)
			name := strings.TrimPrefix(key, d.prefix)
			if name == "" || strings.Contains(name, "/") || !extract.SupportedExtension(name) {
				continue
			}
			docs = append(docs, document{
				Name:         name,
				Key:          key,
				Size:         aws.ToInt64(obj.Size),
				LastModified: aws.ToTime(obj.LastModified),
			})
		}
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].Name < docs[j].Name })
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
	for _, doc := range docs {
		if doc.Name == name {
			return doc, nil
		}
	}
	return document{}, fmt.Errorf("document %q not found; use list-documents to see the available ones", name)
}

func (d *docStore) handleList(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	docs, err := d.list(ctx)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(docs) == 0 {
		return mcp.NewToolResultText("The group's knowledge base has no documents."), nil
	}
	var b strings.Builder
	for _, doc := range docs {
		fmt.Fprintf(&b, "%s\t%s\t%s\n", doc.Name, humanSize(doc.Size), doc.LastModified.UTC().Format("2006-01-02 15:04"))
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

func (d *docStore) handleSearch(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, _ := request.GetArguments()["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return mcp.NewToolResultError("missing 'query'"), nil
	}
	needle := strings.ToLower(query)

	docs, err := d.list(ctx)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	var b strings.Builder
	hits := 0
	var skipped []string
	for _, doc := range docs {
		if strings.Contains(strings.ToLower(doc.Name), needle) {
			fmt.Fprintf(&b, "%s: (document name matches)\n", doc.Name)
			hits++
		}
		text, err := d.readText(ctx, doc)
		if err != nil {
			skipped = append(skipped, doc.Name)
			continue
		}
		for i, line := range strings.Split(text, "\n") {
			if hits >= maxSearchHits {
				break
			}
			if strings.Contains(strings.ToLower(line), needle) {
				fmt.Fprintf(&b, "%s:%d: %s\n", doc.Name, i+1, strings.TrimSpace(truncate(line, 300)))
				hits++
			}
		}
		if hits >= maxSearchHits {
			fmt.Fprintf(&b, "[stopped after %d matches]\n", maxSearchHits)
			break
		}
	}
	if hits == 0 {
		b.WriteString(fmt.Sprintf("No matches for %q.\n", query))
	}
	if len(skipped) > 0 {
		fmt.Fprintf(&b, "[not searched (unreadable, or too large): %s]\n", strings.Join(skipped, ", "))
	}
	return mcp.NewToolResultText(b.String()), nil
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
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

// knowledgeClient calls pipelines' knowledge search endpoint.
type knowledgeClient struct {
	groupID int
	url     string
	token   string
}

type knowledgeResult struct {
	File     string  `json:"file"`
	Location string  `json:"location"`
	Content  string  `json:"content"`
	Score    float64 `json:"score"`
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

	body, _ := json.Marshal(map[string]any{
		"group_id": k.groupID,
		"token":    k.token,
		"query":    query,
		"top_k":    topK,
	})
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, k.url, bytes.NewReader(body))
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return mcp.NewToolResultError("the knowledge base is not reachable: " + err.Error()), nil
	}
	defer resp.Body.Close()

	var out struct {
		Results []knowledgeResult `json:"results"`
		Error   string            `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&out); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid answer from the knowledge base (HTTP %d)", resp.StatusCode)), nil
	}
	if resp.StatusCode != http.StatusOK {
		return mcp.NewToolResultError("knowledge search failed: " + out.Error), nil
	}
	if len(out.Results) == 0 {
		return mcp.NewToolResultText(fmt.Sprintf("Nothing relevant to %q in the group's knowledge base.", query)), nil
	}

	var b strings.Builder
	for i, r := range out.Results {
		source := r.File
		if r.Location != "" {
			source += ", " + r.Location
		}
		fmt.Fprintf(&b, "[%d] %s\n%s\n\n", i+1, source, strings.TrimSpace(r.Content))
	}
	return mcp.NewToolResultText(b.String()), nil
}
