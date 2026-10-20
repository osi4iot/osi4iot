// doc_info is the MCP server that gives an AI agent read access to its
// digital twin's documents (the docInfoFiles), straight from the bucket:
// nothing is copied to the pipelines' disk.
//
// It replaces the built-in "filesystem" server, which needed a local
// folder. The agent can list, read and search the documents; it cannot
// write them (they are managed from the platform).
//
// Usage: doc_info --prefix org_data/org_1/group_1/digitalTwin_2/docInfoFiles/
//
// The bucket comes from the environment pipelines passes on:
// MCP_S3_BUCKET, MCP_S3_REGION, MCP_S3_ACCESS_KEY_ID,
// MCP_S3_SECRET_ACCESS_KEY and MCP_S3_ENDPOINT (empty for AWS S3,
// http://garage:3900 for Garage).
package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const (
	defaultMaxChars = 50000    // per read-document call
	maxDocumentSize = 20 << 20 // documents larger than this are not read
	maxSearchHits   = 50
)

type docStore struct {
	client *s3.Client
	bucket string
	prefix string
}

type document struct {
	Name         string
	Key          string
	Size         int64
	LastModified time.Time
}

func main() {
	var prefix string
	flag.StringVar(&prefix, "prefix", "", "S3 prefix of the digital twin's documents (…/docInfoFiles/)")
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
		server.WithInstructions("Read the documents attached to this digital twin: manuals, specifications, reports."),
	)

	s.AddTool(mcp.NewTool("list-documents",
		mcp.WithDescription("List the documents of the digital twin, with their size and date."),
	), store.handleList)

	s.AddTool(mcp.NewTool("read-document",
		mcp.WithDescription(fmt.Sprintf(
			"Read a text document. Long documents are returned in parts of up to %d characters: "+
				"call again with the 'offset' given at the end of the previous part.", defaultMaxChars)),
		mcp.WithString("name", mcp.Description("Document name, as list-documents shows it"), mcp.Required()),
		mcp.WithNumber("offset", mcp.Description("Character offset to start reading from (default 0)")),
	), store.handleRead)

	s.AddTool(mcp.NewTool("search-documents",
		mcp.WithDescription("Search the text documents for a word or phrase (case-insensitive). "+
			"Returns the matching lines with their document and line number."),
		mcp.WithString("query", mcp.Description("Text to search for"), mcp.Required()),
	), store.handleSearch)

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
	return &docStore{client: client, bucket: bucket, prefix: prefix}, nil
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
			if name == "" || strings.HasSuffix(name, "/") {
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

// readText reads a document and returns it as text, or an error if it is
// too large or not text.
func (d *docStore) readText(ctx context.Context, doc document) (string, error) {
	if doc.Size > maxDocumentSize {
		return "", fmt.Errorf("document %q is too large to read (%d MB)", doc.Name, doc.Size>>20)
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
	if !utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0 {
		return "", fmt.Errorf("document %q is not a text document (%s); only text documents can be read",
			doc.Name, path.Ext(doc.Name))
	}
	return string(data), nil
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
		return mcp.NewToolResultText("This digital twin has no documents."), nil
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
		fmt.Fprintf(&b, "[not searched (not text, or too large): %s]\n", strings.Join(skipped, ", "))
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

