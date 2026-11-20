package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

const userDir = "user_0123456789abcdef01234567/2026-11-19/"

// a workbook as Excel saves it: shared strings, a date style, an inline string, a boolean, a second sheet
func testWorkbook(t *testing.T) []byte {
	parts := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
		"xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Medidas" sheetId="1" r:id="rId1"/><sheet name="Resumen" sheetId="2" r:id="rId2"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
		"xl/sharedStrings.xml": `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<si><t>Fecha</t></si><si><t>Sensor</t></si><si><r><t>Temperatura </t></r><r><t>(°C)</t></r></si><si><t>S1</t></si><si><t>S2</t></si></sst>`,
		"xl/styles.xml": `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy\ hh:mm"/><numFmt numFmtId="165" formatCode="0.00&quot;m&quot;"/></numFmts>
<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`,
		"xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>OK</t></is></c></row>
<row r="2"><c r="A2" s="1"><v>46023</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="3"><v>20.5</v></c><c r="D2" t="b"><v>1</v></c></row>
<row r="3"><c r="A3" s="2"><v>46024.5</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>21.25</v></c><c r="D3" t="b"><v>0</v></c></row>
<row r="5"><c r="A5" s="1"><v>46025</v></c><c r="B5" t="s"><v>3</v></c><c r="C5" t="e"><v>#DIV/0!</v></c></row>
</sheetData></worksheet>`,
		"xl/worksheets/sheet2.xml": `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="3"><c r="B3" t="inlineStr"><is><t>x</t></is></c><c r="C3" t="inlineStr"><is><t>y</t></is></c></row>
<row r="4"><c r="B4"><v>1</v></c><c r="C4"><f>B4*2</f><v>2</v></c></row>
<row r="5"><c r="B5"><v>2</v></c><c r="C5"><f>B5*2</f><v>4</v></c></row>
</sheetData></worksheet>`,
	}
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	for name, body := range parts {
		f, _ := w.Create(name)
		f.Write([]byte(body))
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func setup(t *testing.T) (xlsxHandle, csvHandle string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, userDir), 0o700); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, userDir, "AbCdEfGh123.xlsx"), testWorkbook(t), 0o600)
	// as Excel saves a CSV in Spain: Windows-1252, ";" and a decimal comma
	os.WriteFile(filepath.Join(dir, userDir, "CsvLatin1x.csv"), []byte("nombre;valor;fecha\nAna Mu\xf1oz;1,5;2026-01-02\nJos\xe9;3,25;2026-01-03\n"), 0o600)
	cfg = config{prefix: dir + "/", secret: []byte("0123456789abcdef0123456789abcdef"), http: http.DefaultClient}
	tables = &tableCache{items: map[string]*table{}}
	return Handle(cfg.secret, userDir+"AbCdEfGh123.xlsx"), Handle(cfg.secret, userDir+"CsvLatin1x.csv")
}

func call(t *testing.T, h func(context.Context, mcp.CallToolRequest) (*mcp.CallToolResult, error), args map[string]any) (string, bool) {
	t.Helper()
	req := mcp.CallToolRequest{}
	req.Params.Arguments = args
	res, err := h(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(mcp.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	return b.String(), res.IsError
}

func TestHandles(t *testing.T) {
	xlsx, _ := setup(t)
	if _, err := relOf(xlsx); err != nil {
		t.Fatal(err)
	}
	other := Handle([]byte("another node's secret, 32 bytes!"), userDir+"AbCdEfGh123.xlsx")
	forged := Handle(cfg.secret, "../../etc/passwd.csv")
	for _, h := range []string{other, forged, "tbl_", "data", xlsx + "x", strings.Replace(xlsx, "tbl_", "tbl_A", 1)} {
		if _, err := relOf(h); err == nil {
			t.Errorf("accepted %q", h)
		}
	}
}

func TestExcel(t *testing.T) {
	xlsx, _ := setup(t)
	out, isErr := call(t, handleDescribe, map[string]any{"table": xlsx})
	if isErr {
		t.Fatal(out)
	}
	for _, want := range []string{"Medidas, Resumen", "3 rows", "Temperatura (°C)", "2026-01-01", "2026-01-02 12:00:00", "S2"} {
		if !strings.Contains(out, want) {
			t.Errorf("describe lacks %q:\n%s", want, out)
		}
	}
	out, isErr = call(t, handleQuery, map[string]any{"table": xlsx, "sql": `SELECT Sensor, avg("Temperatura (°C)") AS t, count(*) n FROM data GROUP BY ALL ORDER BY 1`})
	if isErr || !strings.Contains(out, "| S1 | 20.5 | 2 |") || !strings.Contains(out, "| S2 | 21.25 | 1 |") {
		t.Errorf("query:\n%s", out)
	}
	out, isErr = call(t, handleQuery, map[string]any{"table": xlsx, "sheet": "Resumen", "sql": "SELECT sum(y) FROM data"})
	if isErr || !strings.Contains(out, "| 6 |") {
		t.Errorf("sheet Resumen:\n%s", out)
	}
	out, isErr = call(t, handleQuery, map[string]any{"table": xlsx, "sheet": "Nope", "sql": "SELECT 1"})
	if !isErr || !strings.Contains(out, "Medidas, Resumen") {
		t.Errorf("unknown sheet:\n%s", out)
	}
}

func TestCSVLatin1(t *testing.T) {
	_, csvH := setup(t)
	out, isErr := call(t, handleQuery, map[string]any{"table": csvH, "sql": "SELECT nombre, valor * 2 AS doble, typeof(fecha) FROM data ORDER BY valor"})
	if isErr || !strings.Contains(out, "| Ana Muñoz | 3 | DATE |") || !strings.Contains(out, "| José | 6.5 | DATE |") {
		t.Errorf("csv:\n%s", out)
	}
}

func TestLockedDown(t *testing.T) {
	_, csvH := setup(t)
	os.Setenv("CHAT_DATA_TEST_SECRET", "s3cr3t")
	for _, q := range []string{
		"SELECT * FROM read_csv('/etc/passwd')",
		"SELECT * FROM read_text('/etc/hostname')",
		"SELECT * FROM '" + cfg.prefix + userDir + "CsvLatin1x.csv'",
		"SELECT * FROM glob('/*')",
		"SELECT getenv('CHAT_DATA_TEST_SECRET')",
		"SELECT * FROM 'https://example.com/x.csv'",
		"SELECT 1; COPY data TO '/tmp/x.csv'",
		"COPY data TO '/tmp/x.csv'",
		"ATTACH '/tmp/x.db'",
		"INSTALL httpfs",
		"SET enable_external_access=true",
		"DROP TABLE data",
		"PRAGMA version",
		"WITH a AS (SELECT 1) SELECT * FROM read_blob('/etc/hostname')",
	} {
		out, isErr := call(t, handleQuery, map[string]any{"table": csvH, "sql": q})
		if !isErr || strings.Contains(out, "s3cr3t") || strings.Contains(out, "root:") {
			t.Errorf("%s ran:\n%s", q, out)
		}
	}
	// the table is still there and readable
	out, isErr := call(t, handleQuery, map[string]any{"table": csvH, "sql": "-- count\nSELECT count(*) FROM data;"})
	if isErr || !strings.Contains(out, "| 2 |") {
		t.Errorf("count:\n%s", out)
	}
}

func TestResultLimits(t *testing.T) {
	_, csvH := setup(t)
	out, isErr := call(t, handleQuery, map[string]any{"table": csvH, "sql": "SELECT range AS i FROM range(1000)"})
	if isErr || !strings.Contains(out, "there are more") || strings.Count(out, "\n") > maxResultRows+5 {
		t.Errorf("limit:\n%.300s", out)
	}
}

func TestChart(t *testing.T) {
	xlsx, _ := setup(t)
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agentdata/table_chart" {
			http.NotFound(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &got)
		w.Write([]byte(`{"chart_id":"chart_0123456789abcdef01234567"}`))
	}))
	defer srv.Close()
	cfg.dataURL, cfg.token, cfg.groupID, cfg.dtID = srv.URL+"/v1/agentdata", "tok", 2, 3
	out, isErr := call(t, handleChart, map[string]any{"table": xlsx, "sql": `SELECT Fecha, "Temperatura (°C)" FROM data ORDER BY 1`, "title": "T"})
	if isErr || !strings.Contains(out, "chart_0123456789abcdef01234567") {
		t.Fatalf("chart:\n%s", out)
	}
	if got["token"] != "tok" || got["group_id"] != float64(2) || got["x_time"] != true || len(got["x"].([]any)) != 3 {
		t.Errorf("request: %v", got)
	}
	series := got["series"].([]any)[0].(map[string]any)
	if ys := series["y"].([]any); ys[2] != nil || ys[0] != 20.5 {
		t.Errorf("y: %v", ys)
	}
	out, isErr = call(t, handleChart, map[string]any{"table": xlsx, "kind": "bar", "sql": `SELECT Sensor, count(*) FROM data GROUP BY 1 ORDER BY 1`})
	if isErr || got["categories"].([]any)[1] != "S2" {
		t.Errorf("bar: %s %v", out, got)
	}
	out, isErr = call(t, handleChart, map[string]any{"table": xlsx, "sql": `SELECT Sensor, 1 FROM data`})
	if !isErr {
		t.Errorf("a line of categories was accepted: %s", out)
	}
}
