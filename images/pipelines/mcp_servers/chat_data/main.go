// chat_data is the MCP server that gives a digital twin's AI agents the tables the users attach to the chat (CSV,
// Excel .xlsx): their columns and a summary, SQL queries over them (DuckDB) and charts of the results, shown with
// the answer. The data never goes to the model whole: the agent asks, DuckDB computes.
//
// Usage: OSI4IOT_CHAT_DATA_SECRET=… [OSI4IOT_AGENTDATA_TOKEN=…] chat_data
//
//	--prefix s3://bucket/org_data/org_1/group_2/chat_attachments/dt_3/ (or a local directory)
//	[--data_url http://127.0.0.1:7072/v1/agentdata --group_id 2 --digital_twin_id 3]   (for the charts)
//
// pipelines starts it (nodes/aiAgentNode.go) for an AiAgent node, so all the users of the chat share it. A table is
// named by a handle that pipelines gives the agent with the attachment ("tbl_…"): the file's path in the user's folder
// signed (HMAC) with the node's secret. The agent cannot name a file of another user, or of another digital twin:
// it does not know the secret. The bucket's settings come from the MCP_S3_* environment, as for fem_results.
//
// Each table is loaded in a DuckDB database of its own, without the bucket's credentials (another short-lived
// database reads the file), and then locked: no files, no network, no extensions, no changes of its settings. The
// SQL of the agent can only read the table "data".
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const (
	secretEnv = "OSI4IOT_CHAT_DATA_SECRET"
	tokenEnv  = "OSI4IOT_AGENTDATA_TOKEN"

	maxFileSize    = 10 << 20 // as admin_api accepts
	maxResultRows  = 200
	maxResultText  = 12000
	maxCellText    = 80
	maxChartRows   = 5000
	maxChartSeries = 6
	maxCategories  = 60
	queryTimeout   = 20 * time.Second
	cachedTables   = 4
	cacheTTL       = 15 * time.Minute
	memoryLimit    = "512MB"
)

// the path of an attachment in its digital twin's folder: the user's folder, the day, the file
var relPathRe = regexp.MustCompile(`^user_[0-9a-f]{24}/\d{4}-\d{2}-\d{2}/[A-Za-z0-9_-]{8,40}\.(csv|xlsx)$`)

type config struct {
	prefix  string // s3://bucket/…/ or a local directory, ending in /
	secret  []byte
	dataURL string
	token   string
	groupID int
	dtID    int
	http    *http.Client
}

var cfg config

// ---- handles ----

// Handle is how pipelines names a table for the agent (nodes/aiAgentTables.go makes the same).
func Handle(secret []byte, rel string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte("chat-data:" + rel))
	return "tbl_" + base64.RawURLEncoding.EncodeToString([]byte(rel)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)[:16])
}

// relOf checks a handle and gives the path it names
func relOf(handle string) (string, error) {
	invalid := errors.New("unknown table: use the handle given with the attachment (tbl_…), as it is")
	body, ok := strings.CutPrefix(strings.TrimSpace(handle), "tbl_")
	if !ok {
		return "", invalid
	}
	encRel, encMac, ok := strings.Cut(body, ".")
	if !ok {
		return "", invalid
	}
	rel, err1 := base64.RawURLEncoding.DecodeString(encRel)
	mac, err2 := base64.RawURLEncoding.DecodeString(encMac)
	if err1 != nil || err2 != nil || !relPathRe.Match(rel) {
		return "", invalid
	}
	want := hmac.New(sha256.New, cfg.secret)
	want.Write([]byte("chat-data:" + string(rel)))
	if !hmac.Equal(mac, want.Sum(nil)[:16]) {
		return "", invalid
	}
	return string(rel), nil
}

// ---- reading the file ----

func isS3(prefix string) bool { return strings.HasPrefix(prefix, "s3://") }

// fetch reads an attachment: from the bucket with a database of its own (the only one with the bucket's
// credentials, closed straight away), or from the local directory
func fetch(ctx context.Context, rel string) ([]byte, error) {
	if !isS3(cfg.prefix) {
		data, err := os.ReadFile(filepath.Join(cfg.prefix, filepath.FromSlash(rel)))
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("the file is no longer stored (attachments are deleted after some days)")
		}
		return data, err
	}
	db, err := sql.Open("duckdb", "")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := setupS3(db); err != nil {
		return nil, fmt.Errorf("bucket: %w", err)
	}
	var data []byte
	var size int64
	err = db.QueryRowContext(ctx, "SELECT content, size FROM read_blob(?)", cfg.prefix+rel).Scan(&data, &size)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || strings.Contains(err.Error(), "404") || strings.Contains(strings.ToLower(err.Error()), "no files found") {
			return nil, errors.New("the file is no longer stored (attachments are deleted after some days)")
		}
		return nil, err
	}
	return data, nil
}

// setupS3 is fem_results' (the bucket's settings from the MCP_S3_* environment, httpfs from DUCKDB_EXT_DIR)
func setupS3(db *sql.DB) error {
	exec := func(stmt string) error {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("%s: %w", strings.SplitN(stmt, "=", 2)[0], err)
		}
		return nil
	}
	quote := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	if home := os.Getenv("DUCKDB_HOME_DIR"); home != "" {
		if err := exec("SET home_directory=" + quote(home)); err != nil {
			return err
		}
	} else if _, err := os.Stat("/tmp/duckdb"); err == nil {
		if err := exec("SET home_directory='/tmp/duckdb'"); err != nil {
			return err
		}
	}
	installed := false
	if extDir := os.Getenv("DUCKDB_EXT_DIR"); extDir != "" {
		if err := exec("SET extension_directory=" + quote(extDir)); err != nil {
			return err
		}
		file := filepath.Join(extDir, "httpfs.duckdb_extension")
		if _, err := os.Stat(file); err == nil {
			if err := exec("INSTALL " + quote(file)); err != nil {
				return err
			}
			installed = true
		}
	}
	if !installed {
		if err := exec("INSTALL httpfs"); err != nil {
			return err
		}
	}
	if err := exec("LOAD httpfs"); err != nil {
		return err
	}
	region := os.Getenv("MCP_S3_REGION")
	if region == "" {
		region = "us-east-1"
	}
	stmts := []string{"SET s3_region=" + quote(region)}
	if v := os.Getenv("MCP_S3_ACCESS_KEY_ID"); v != "" {
		stmts = append(stmts, "SET s3_access_key_id="+quote(v))
	}
	if v := os.Getenv("MCP_S3_SECRET_ACCESS_KEY"); v != "" {
		stmts = append(stmts, "SET s3_secret_access_key="+quote(v))
	}
	if raw := strings.TrimSpace(os.Getenv("MCP_S3_ENDPOINT")); raw != "" {
		useSSL := !strings.HasPrefix(raw, "http://")
		endpoint := strings.TrimRight(strings.TrimPrefix(strings.TrimPrefix(raw, "https://"), "http://"), "/")
		stmts = append(stmts, "SET s3_endpoint="+quote(endpoint), "SET s3_url_style='path'", fmt.Sprintf("SET s3_use_ssl=%v", useSSL))
	}
	for _, stmt := range stmts {
		if err := exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

// cp1252 is the text of a CSV that is not UTF-8: as Excel saves it in Spain (Windows-1252, Latin-1)
var cp1252 = [32]rune{'€', 0x81, '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', 0x8d, 'Ž', 0x8f,
	0x90, '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', 0x9d, 'ž', 'Ÿ'}

func toUTF8(data []byte) []byte {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf")) // the BOM of Excel's "CSV UTF-8"
	if utf8.Valid(data) {
		return data
	}
	var b bytes.Buffer
	for _, c := range data {
		switch {
		case c < 0x80:
			b.WriteByte(c)
		case c < 0xa0:
			b.WriteRune(cp1252[c-0x80])
		default:
			b.WriteRune(rune(c))
		}
	}
	return b.Bytes()
}

// ---- the tables ----

type table struct {
	db      *sql.DB
	rows    int64
	sheets  []string // an Excel file's
	sheet   string
	used    time.Time
	loadErr error
}

type tableCache struct {
	mu    sync.Mutex
	items map[string]*table
}

var tables = &tableCache{items: map[string]*table{}}

// get gives the table of a handle (and sheet), loading it the first time
func (tc *tableCache) get(ctx context.Context, handle, sheet string) (*table, error) {
	rel, err := relOf(handle)
	if err != nil {
		return nil, err
	}
	key := rel + "\x00" + sheet
	tc.mu.Lock()
	defer tc.mu.Unlock()
	now := time.Now()
	for k, t := range tc.items {
		if now.Sub(t.used) > cacheTTL {
			t.db.Close()
			delete(tc.items, k)
		}
	}
	if t, ok := tc.items[key]; ok {
		t.used = now
		return t, nil
	}
	t, err := load(ctx, rel, sheet)
	if err != nil {
		return nil, err
	}
	if len(tc.items) >= cachedTables {
		var oldest string
		for k, c := range tc.items {
			if oldest == "" || c.used.Before(tc.items[oldest].used) {
				oldest = k
			}
		}
		tc.items[oldest].db.Close()
		delete(tc.items, oldest)
	}
	t.used = now
	tc.items[key] = t
	return t, nil
}

// load reads a file into a locked database of its own, as the table "data"
func load(ctx context.Context, rel, sheet string) (*table, error) {
	data, err := fetch(ctx, rel)
	if err != nil {
		return nil, err
	}
	if len(data) > maxFileSize {
		return nil, fmt.Errorf("the file has more than %d MB", maxFileSize>>20)
	}
	t := &table{}
	csvData := data
	if strings.HasSuffix(rel, ".xlsx") {
		book, err := openWorkbook(data)
		if err != nil {
			return nil, fmt.Errorf("the Excel file cannot be read: %w", err)
		}
		t.sheets = book.sheetNames()
		if sheet == "" {
			sheet = t.sheets[0]
		}
		rows, err := book.readSheet(sheet)
		if err != nil {
			return nil, err
		}
		var b bytes.Buffer
		w := csv.NewWriter(&b)
		if err := w.WriteAll(rows); err != nil {
			return nil, err
		}
		csvData = b.Bytes()
		t.sheet = sheet
	} else {
		if sheet != "" {
			return nil, errors.New("a CSV file has no sheets")
		}
		csvData = toUTF8(data)
	}
	if len(bytes.TrimSpace(csvData)) == 0 {
		return nil, errors.New("the table is empty")
	}

	dir, err := os.MkdirTemp("", "chat-data-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "table.csv")
	if err := os.WriteFile(path, csvData, 0o600); err != nil {
		return nil, err
	}

	db, err := sql.Open("duckdb", "")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	fail := func(err error) (*table, error) {
		db.Close()
		return nil, err
	}
	for _, stmt := range []string{
		"SET memory_limit='" + memoryLimit + "'",
		"SET threads=2",
		"SET autoinstall_known_extensions=false",
		"SET autoload_known_extensions=false",
	} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fail(err)
		}
	}
	// a CSV with ";" is as Excel saves it in Spain: with a decimal comma
	var delim string
	if err := db.QueryRowContext(ctx, "SELECT Delimiter FROM sniff_csv(?)", path).Scan(&delim); err != nil {
		return fail(fmt.Errorf("the CSV cannot be read: %v", shortError(err)))
	}
	options := "sample_size=-1"
	if t.sheet != "" {
		options += ", header=true" // the first row with data of a sheet
	} else if delim == ";" {
		options += ", delim=';', decimal_separator=','"
	}
	quoted := "'" + strings.ReplaceAll(path, "'", "''") + "'"
	if _, err := db.ExecContext(ctx, "CREATE TABLE data AS SELECT * FROM read_csv("+quoted+", "+options+")"); err != nil {
		return fail(fmt.Errorf("the table cannot be read: %v", shortError(err)))
	}
	// from now on, the table only: no files, no network, no extensions, no other settings
	for _, stmt := range []string{"SET enable_external_access=false", "SET lock_configuration=true"} {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fail(err)
		}
	}
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM data").Scan(&t.rows); err != nil {
		return fail(err)
	}
	t.db = db
	return t, nil
}

func shortError(err error) string {
	s := err.Error()
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}

// ---- SQL ----

var leadingComments = regexp.MustCompile(`^(\s*(--[^\n]*\n|/\*.*?\*/))*\s*`)
var firstWord = regexp.MustCompile(`(?i)^(select|with|from)\b`)

// checkSQL accepts one query (SELECT, WITH or FROM …) and gives it wrapped, so that nothing else can run
func checkSQL(query string, limit int) (string, error) {
	q := strings.TrimSpace(query)
	q = strings.TrimSpace(strings.TrimRight(q, "; \n\t"))
	body := leadingComments.ReplaceAllString(q, "")
	if body == "" {
		return "", errors.New("write a query over the table data: SELECT … FROM data …")
	}
	if !firstWord.MatchString(body) {
		return "", errors.New("only a query can run: SELECT … FROM data … (or WITH …)")
	}
	if strings.Contains(q, ";") {
		return "", errors.New("one query at a time, without ;")
	}
	return fmt.Sprintf("SELECT * FROM (\n%s\n) AS q LIMIT %d", q, limit), nil
}

type result struct {
	columns []string
	types   []string
	rows    [][]any
	more    bool
}

func (t *table) query(ctx context.Context, query string, limit int) (*result, error) {
	wrapped, err := checkSQL(query, limit+1)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	rows, err := t.db.QueryContext(ctx, wrapped)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("the query took more than %s", queryTimeout)
		}
		return nil, errors.New(shortError(err))
	}
	defer rows.Close()
	r := &result{}
	r.columns, _ = rows.Columns()
	if cts, err := rows.ColumnTypes(); err == nil {
		for _, c := range cts {
			r.types = append(r.types, c.DatabaseTypeName())
		}
	}
	for rows.Next() {
		if len(r.rows) == limit {
			r.more = true
			break
		}
		vals := make([]any, len(r.columns))
		ptrs := make([]any, len(vals))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		r.rows = append(r.rows, vals)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.New(shortError(err))
	}
	return r, nil
}

func formatNumber(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return strconv.FormatFloat(f, 'g', -1, 64)
	}
	if f == math.Trunc(f) && math.Abs(f) < 1e15 {
		return strconv.FormatInt(int64(f), 10)
	}
	return strconv.FormatFloat(f, 'g', 6, 64)
}

func formatValue(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return formatNumber(x)
	case float32:
		return formatNumber(float64(x))
	case time.Time:
		if x.Hour() == 0 && x.Minute() == 0 && x.Second() == 0 && x.Nanosecond() == 0 {
			return x.Format("2006-01-02")
		}
		return x.Format("2006-01-02 15:04:05")
	case []byte:
		return fmt.Sprintf("(%d bytes)", len(x))
	case string:
		s := strings.ReplaceAll(strings.ReplaceAll(x, "|", "/"), "\n", " ")
		if r := []rune(s); len(r) > maxCellText {
			return string(r[:maxCellText]) + "…"
		}
		return s
	}
	return fmt.Sprint(v)
}

// table of the result, as markdown, within maxResultText characters
func (r *result) markdown() string {
	var b strings.Builder
	b.WriteString("| " + strings.Join(r.columns, " | ") + " |\n|")
	for range r.columns {
		b.WriteString(" --- |")
	}
	b.WriteString("\n")
	shown := 0
	for _, row := range r.rows {
		cells := make([]string, len(row))
		for i, v := range row {
			cells[i] = formatValue(v)
		}
		line := "| " + strings.Join(cells, " | ") + " |\n"
		if b.Len()+len(line) > maxResultText {
			break
		}
		b.WriteString(line)
		shown++
	}
	switch {
	case shown < len(r.rows) || r.more:
		fmt.Fprintf(&b, "(%d rows shown; there are more: aggregate, filter or add LIMIT/ORDER BY)\n", shown)
	case shown == 0:
		b.WriteString("(no rows)\n")
	default:
		fmt.Fprintf(&b, "(%d rows)\n", shown)
	}
	return b.String()
}

// ---- the tools ----

func argString(req mcp.CallToolRequest, key string) string {
	if v, ok := req.GetArguments()[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func errorResult(err error) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(err.Error()), nil
}

func handleDescribe(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	t, err := tables.get(ctx, argString(req, "table"), argString(req, "sheet"))
	if err != nil {
		return errorResult(err)
	}
	var b strings.Builder
	if len(t.sheets) > 0 {
		fmt.Fprintf(&b, "Excel sheets: %s. This is the sheet %q (another one: the argument sheet).\n", strings.Join(t.sheets, ", "), t.sheet)
	}
	fmt.Fprintf(&b, "The table data has %d rows.\n\nColumns (name, type, min, max, average, distinct values, empty %%):\n", t.rows)
	summary, err := t.query(ctx, "SELECT column_name, column_type, min, max, avg, approx_unique, null_percentage FROM (SUMMARIZE data)", 300)
	if err != nil {
		return errorResult(err)
	}
	b.WriteString(summary.markdown())
	sample, err := t.query(ctx, "SELECT * FROM data LIMIT 5", 5)
	if err != nil {
		return errorResult(err)
	}
	b.WriteString("\nFirst rows:\n")
	b.WriteString(sample.markdown())
	b.WriteString("\nQuery it with query-table (SQL of DuckDB over the table data); quote the names of columns with spaces or capitals: \"Temperature (°C)\".")
	return mcp.NewToolResultText(b.String()), nil
}

func handleQuery(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	t, err := tables.get(ctx, argString(req, "table"), argString(req, "sheet"))
	if err != nil {
		return errorResult(err)
	}
	r, err := t.query(ctx, argString(req, "sql"), maxResultRows)
	if err != nil {
		return errorResult(err)
	}
	return mcp.NewToolResultText(r.markdown()), nil
}

// a value of a chart: a number, a date (milliseconds) or a category
func chartNumber(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, !math.IsNaN(x) && !math.IsInf(x, 0)
	case float32:
		return float64(x), true
	case int64:
		return float64(x), true
	case int32:
		return float64(x), true
	case int16:
		return float64(x), true
	case int8:
		return float64(x), true
	case int:
		return float64(x), true
	case uint64:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint8:
		return float64(x), true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	}
	if s, ok := v.(fmt.Stringer); ok { // DECIMAL, HUGEINT
		f, err := strconv.ParseFloat(s.String(), 64)
		return f, err == nil
	}
	return 0, false
}

// a date of a chart's x: a DATE or TIMESTAMP, or a text with a date
func chartTime(v any) (time.Time, bool) {
	switch x := v.(type) {
	case time.Time:
		return x, true
	case string:
		for _, layout := range []string{"2006-01-02", "2006-01-02 15:04:05", "2006-01-02T15:04:05Z07:00", "2006-01-02 15:04"} {
			if t, err := time.Parse(layout, strings.TrimSpace(x)); err == nil {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

type chartSeries struct {
	Name string     `json:"name"`
	Y    []*float64 `json:"y"`
}

type chartRequest struct {
	Kind       string        `json:"kind"`
	Title      string        `json:"title"`
	XLabel     string        `json:"x_label"`
	YLabel     string        `json:"y_label"`
	X          []float64     `json:"x,omitempty"`
	XTime      bool          `json:"x_time,omitempty"`
	Categories []string      `json:"categories,omitempty"`
	Series     []chartSeries `json:"series"`
}

func handleChart(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if cfg.dataURL == "" || cfg.token == "" {
		return errorResult(errors.New("charts are not available here"))
	}
	t, err := tables.get(ctx, argString(req, "table"), argString(req, "sheet"))
	if err != nil {
		return errorResult(err)
	}
	kind := strings.ToLower(argString(req, "kind"))
	if kind == "" {
		kind = "line"
	}
	if kind != "line" && kind != "scatter" && kind != "bar" {
		return errorResult(errors.New(`kind is "line", "scatter" or "bar"`))
	}
	r, err := t.query(ctx, argString(req, "sql"), maxChartRows)
	if err != nil {
		return errorResult(err)
	}
	if len(r.columns) < 2 {
		return errorResult(errors.New("the query must give the x (first column) and one or more y (the next ones)"))
	}
	if len(r.columns)-1 > maxChartSeries {
		return errorResult(fmt.Errorf("at most %d y columns", maxChartSeries))
	}
	if len(r.rows) == 0 {
		return errorResult(errors.New("the query gives no rows"))
	}
	c := chartRequest{Kind: kind, Title: argString(req, "title"), XLabel: argString(req, "x_label"), YLabel: argString(req, "y_label")}
	if c.XLabel == "" {
		c.XLabel = r.columns[0]
	}
	for _, name := range r.columns[1:] {
		c.Series = append(c.Series, chartSeries{Name: name})
	}
	for _, row := range r.rows {
		switch {
		case kind == "bar":
			c.Categories = append(c.Categories, formatValue(row[0]))
		default:
			if tm, ok := chartTime(row[0]); ok {
				c.XTime = true
				c.X = append(c.X, float64(tm.UnixMilli()))
			} else if f, ok := chartNumber(row[0]); ok {
				c.X = append(c.X, f)
			} else {
				return errorResult(fmt.Errorf("the x of a %s chart must be numbers or dates (it is %v); for categories, a bar chart", kind, row[0]))
			}
		}
		for i, v := range row[1:] {
			var y *float64
			if f, ok := chartNumber(v); ok {
				y = &f
			} else if v != nil {
				return errorResult(fmt.Errorf("the column %s is not numeric (%v)", r.columns[i+1], v))
			}
			c.Series[i].Y = append(c.Series[i].Y, y)
		}
	}
	if kind == "bar" && len(c.Categories) > maxCategories {
		return errorResult(fmt.Errorf("a bar chart shows at most %d categories: group them or keep the largest", maxCategories))
	}
	id, err := postChart(ctx, c)
	if err != nil {
		return errorResult(err)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Chart %s drawn (%d points%s): it is shown with your answer; do not describe the image, comment on the values.\n", id, len(r.rows),
		map[bool]string{true: "; only the first ones: there were more", false: ""}[r.more])
	for _, s := range c.Series {
		lo, hi, sum, n := math.Inf(1), math.Inf(-1), 0.0, 0
		for _, y := range s.Y {
			if y != nil {
				lo, hi, sum, n = math.Min(lo, *y), math.Max(hi, *y), sum+*y, n+1
			}
		}
		if n > 0 {
			fmt.Fprintf(&b, "%s: min %s, max %s, mean %s\n", s.Name, formatNumber(lo), formatNumber(hi), formatNumber(sum/float64(n)))
		}
	}
	return mcp.NewToolResultText(b.String()), nil
}

// postChart asks pipelines' agent data endpoint to draw the chart (as the sensor_history charts) and keep it for the answer
func postChart(ctx context.Context, c chartRequest) (string, error) {
	body := map[string]any{"group_id": cfg.groupID, "digital_twin_id": cfg.dtID, "token": cfg.token}
	raw, _ := json.Marshal(c)
	_ = json.Unmarshal(raw, &body)
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.dataURL+"/table_chart", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := cfg.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("the chart could not be drawn: %v", err)
	}
	defer resp.Body.Close()
	answer, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out struct {
		ChartID string `json:"chart_id"`
		Error   string `json:"error"`
	}
	_ = json.Unmarshal(answer, &out)
	if resp.StatusCode != http.StatusOK || out.ChartID == "" {
		if out.Error == "" {
			out.Error = resp.Status
		}
		return "", fmt.Errorf("the chart could not be drawn: %s", out.Error)
	}
	return out.ChartID, nil
}

func newServer() *server.MCPServer {
	s := server.NewMCPServer("chat-data", "1.0.0", server.WithToolCapabilities(true),
		server.WithInstructions("Tables (CSV, Excel) attached to the chat: describe them, query them with SQL and chart the results. "+
			"A table is named by the handle given with the attachment (tbl_…)."))
	tableArg := mcp.WithString("table", mcp.Required(), mcp.Description("The handle of the table, as given with the attachment (tbl_…)"))
	sheetArg := mcp.WithString("sheet", mcp.Description("An Excel file's sheet (default: the first)"))
	s.AddTool(mcp.NewTool("describe-table",
		mcp.WithDescription("The table's columns (type, minimum, maximum, average, distinct values, empty %), its number of rows and its first rows; the sheets of an Excel file. Call it first."),
		tableArg, sheetArg), handleDescribe)
	s.AddTool(mcp.NewTool("query-table",
		mcp.WithDescription(fmt.Sprintf("Runs one SQL query (DuckDB) over the table, named data, and gives at most %d rows. Compute with SQL (avg, sum, count, GROUP BY, corr, regr_slope, quantile_cont…): never by heart over the rows.", maxResultRows)),
		tableArg, sheetArg,
		mcp.WithString("sql", mcp.Required(), mcp.Description("SELECT … FROM data …"))), handleQuery)
	s.AddTool(mcp.NewTool("table-chart",
		mcp.WithDescription(fmt.Sprintf("Draws a chart of a query over the table, shown with the answer: its first column is x (numbers or dates; categories for bars), the next ones (1 to %d) the y series. At most %d points.", maxChartSeries, maxChartRows)),
		tableArg, sheetArg,
		mcp.WithString("sql", mcp.Required(), mcp.Description("SELECT x, y1, y2 … FROM data … ORDER BY x")),
		mcp.WithString("kind", mcp.Description(`"line" (default), "scatter" or "bar"`)),
		mcp.WithString("title", mcp.Description("Title of the chart")),
		mcp.WithString("x_label", mcp.Description("Name of the x axis (default: the first column)")),
		mcp.WithString("y_label", mcp.Description("Name of the y axis, with units"))), handleChart)
	return s
}

func main() {
	flag.StringVar(&cfg.prefix, "prefix", "", "The digital twin's chat attachments: s3://bucket/…/chat_attachments/dt_<id>/ or a local directory")
	flag.StringVar(&cfg.dataURL, "data_url", "", "pipelines' agent data endpoint (…/v1/agentdata), for the charts")
	flag.IntVar(&cfg.groupID, "group_id", 0, "Group of the digital twin (charts)")
	flag.IntVar(&cfg.dtID, "digital_twin_id", 0, "Digital twin (charts)")
	flag.Parse()
	secret, err := hex.DecodeString(os.Getenv(secretEnv))
	if err != nil || len(secret) < 16 || cfg.prefix == "" {
		log.Fatal("--prefix and the secret ($" + secretEnv + ", hex) are required")
	}
	cfg.secret = secret
	if !strings.HasSuffix(cfg.prefix, "/") {
		cfg.prefix += "/"
	}
	cfg.token = os.Getenv(tokenEnv)
	cfg.dataURL = strings.TrimSuffix(cfg.dataURL, "/")
	cfg.http = &http.Client{Timeout: 60 * time.Second}
	if err := server.ServeStdio(newServer()); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
