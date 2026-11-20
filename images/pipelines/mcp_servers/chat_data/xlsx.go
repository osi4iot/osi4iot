package main

// A small reader of Excel workbooks (.xlsx, Office Open XML): the sheets' names and their cells' values, as text
// (dates as ISO dates), to load them in DuckDB as a CSV. DuckDB's excel extension cannot be installed in the image
// (it is downloaded from extensions.duckdb.org), and this is all that is needed. Formulas give their saved values.

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	maxXMLSize   = 200 << 20 // uncompressed, of each part (a zip bomb stops here)
	maxSheetRows = 300000
	maxSheetCols = 300
	maxCells     = 5000000
)

type workbook struct {
	files     map[string]*zip.File
	sheets    []sheetRef
	shared    []string
	dateStyle []bool // by cell style (s): the number is a date
	date1904  bool
}

type sheetRef struct {
	name string
	path string
}

func openWorkbook(data []byte) (*workbook, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("it is not an .xlsx file")
	}
	wb := &workbook{files: map[string]*zip.File{}}
	for _, f := range zr.File {
		wb.files[strings.TrimPrefix(f.Name, "/")] = f
	}
	if err := wb.readWorkbook(); err != nil {
		return nil, err
	}
	if err := wb.readSharedStrings(); err != nil {
		return nil, err
	}
	if err := wb.readStyles(); err != nil {
		return nil, err
	}
	return wb, nil
}

func (wb *workbook) open(name string) (io.ReadCloser, error) {
	f, ok := wb.files[name]
	if !ok {
		return nil, nil
	}
	if f.UncompressedSize64 > maxXMLSize {
		return nil, fmt.Errorf("%s is too large", name)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	return struct {
		io.Reader
		io.Closer
	}{io.LimitReader(rc, maxXMLSize), rc}, nil
}

func (wb *workbook) decode(name string, v any) (bool, error) {
	rc, err := wb.open(name)
	if err != nil || rc == nil {
		return false, err
	}
	defer rc.Close()
	if err := xml.NewDecoder(rc).Decode(v); err != nil {
		return false, fmt.Errorf("%s: %w", name, err)
	}
	return true, nil
}

func (wb *workbook) readWorkbook() error {
	var book struct {
		Pr struct {
			Date1904 string `xml:"date1904,attr"`
		} `xml:"workbookPr"`
		Sheets []struct {
			Name  string `xml:"name,attr"`
			RID   string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
			State string `xml:"state,attr"`
		} `xml:"sheets>sheet"`
	}
	ok, err := wb.decode("xl/workbook.xml", &book)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("it has no workbook (xl/workbook.xml)")
	}
	wb.date1904 = book.Pr.Date1904 == "1" || book.Pr.Date1904 == "true"
	var rels struct {
		Rels []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
		} `xml:"Relationship"`
	}
	if _, err := wb.decode("xl/_rels/workbook.xml.rels", &rels); err != nil {
		return err
	}
	targets := map[string]string{}
	for _, r := range rels.Rels {
		t := r.Target
		if strings.HasPrefix(t, "/") {
			t = strings.TrimPrefix(t, "/")
		} else {
			t = path.Join("xl", t)
		}
		targets[r.ID] = t
	}
	for _, s := range book.Sheets {
		p, ok := targets[s.RID]
		if !ok || wb.files[p] == nil || s.State == "veryHidden" {
			continue // a chart sheet, or missing
		}
		wb.sheets = append(wb.sheets, sheetRef{name: s.Name, path: p})
	}
	if len(wb.sheets) == 0 {
		return errors.New("it has no sheets")
	}
	return nil
}

// the text of a rich text (<si>, <is>): its <t>, of its runs too, without the phonetic guides (<rPh>)
type richText struct {
	T    string `xml:"t"`
	Runs []struct {
		T string `xml:"t"`
	} `xml:"r"`
}

func (r richText) text() string {
	if len(r.Runs) == 0 {
		return r.T
	}
	var b strings.Builder
	b.WriteString(r.T)
	for _, run := range r.Runs {
		b.WriteString(run.T)
	}
	return b.String()
}

func (wb *workbook) readSharedStrings() error {
	var sst struct {
		Items []richText `xml:"si"`
	}
	if _, err := wb.decode("xl/sharedStrings.xml", &sst); err != nil {
		return err
	}
	wb.shared = make([]string, len(sst.Items))
	for i, it := range sst.Items {
		wb.shared[i] = it.text()
	}
	return nil
}

// Excel's built-in formats of dates and times
var builtinDate = map[int]bool{14: true, 15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true, 22: true,
	27: true, 30: true, 36: true, 45: true, 46: true, 47: true, 50: true, 57: true}

var (
	isoDate  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	isoStamp = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`)
)

var quotedOrBracketed = regexp.MustCompile(`"[^"]*"|\[[^\]]*\]|\\.`)

func isDateFormat(code string) bool {
	code = strings.ToLower(quotedOrBracketed.ReplaceAllString(code, ""))
	if i := strings.IndexByte(code, ';'); i >= 0 {
		code = code[:i]
	}
	return strings.ContainsAny(code, "dyhs") || (strings.Contains(code, "m") && !strings.Contains(code, "0"))
}

func (wb *workbook) readStyles() error {
	var styles struct {
		NumFmts []struct {
			ID   int    `xml:"numFmtId,attr"`
			Code string `xml:"formatCode,attr"`
		} `xml:"numFmts>numFmt"`
		Xfs []struct {
			NumFmtID int `xml:"numFmtId,attr"`
		} `xml:"cellXfs>xf"`
	}
	if _, err := wb.decode("xl/styles.xml", &styles); err != nil {
		return err
	}
	custom := map[int]bool{}
	for _, f := range styles.NumFmts {
		custom[f.ID] = isDateFormat(f.Code)
	}
	wb.dateStyle = make([]bool, len(styles.Xfs))
	for i, xf := range styles.Xfs {
		if d, ok := custom[xf.NumFmtID]; ok {
			wb.dateStyle[i] = d
		} else {
			wb.dateStyle[i] = builtinDate[xf.NumFmtID]
		}
	}
	return nil
}

func (wb *workbook) sheetNames() []string {
	names := make([]string, len(wb.sheets))
	for i, s := range wb.sheets {
		names[i] = s.name
	}
	return names
}

// column of a cell reference: "C12" → 2
func columnOf(ref string) int {
	col := 0
	for _, c := range ref {
		if c < 'A' || c > 'Z' {
			break
		}
		col = col*26 + int(c-'A'+1)
	}
	return col - 1
}

func (wb *workbook) dateText(serial float64) string {
	base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
	if wb.date1904 {
		base = time.Date(1904, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	ms := math.Round(serial * 86400000)
	t := base.Add(time.Duration(ms) * time.Millisecond)
	switch {
	case serial < 1 && !wb.date1904: // a time of day
		return t.Format("15:04:05")
	case t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0:
		return t.Format("2006-01-02")
	}
	return t.Format("2006-01-02 15:04:05")
}

type xmlCell struct {
	Ref    string   `xml:"r,attr"`
	Type   string   `xml:"t,attr"`
	Style  int      `xml:"s,attr"`
	Value  string   `xml:"v"`
	Inline richText `xml:"is"`
}

func (wb *workbook) cellText(c xmlCell) string {
	switch c.Type {
	case "s":
		i, err := strconv.Atoi(strings.TrimSpace(c.Value))
		if err != nil || i < 0 || i >= len(wb.shared) {
			return ""
		}
		return wb.shared[i]
	case "inlineStr":
		return c.Inline.text()
	case "b":
		if strings.TrimSpace(c.Value) == "1" {
			return "true"
		}
		return "false"
	case "e": // #DIV/0!, #N/A…: empty
		return ""
	case "str", "d":
		return c.Value
	}
	v := strings.TrimSpace(c.Value)
	if v == "" {
		return ""
	}
	if c.Style >= 0 && c.Style < len(wb.dateStyle) && wb.dateStyle[c.Style] {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f < 2958466 {
			return wb.dateText(f)
		}
	}
	return v
}

// readSheet gives a sheet's rows, from its first row and column with data, all with the same number of cells
func (wb *workbook) readSheet(name string) ([][]string, error) {
	var ref *sheetRef
	for i := range wb.sheets {
		if wb.sheets[i].name == name {
			ref = &wb.sheets[i]
		}
	}
	if ref == nil {
		return nil, fmt.Errorf("there is no sheet %q: the sheets are %s", name, strings.Join(wb.sheetNames(), ", "))
	}
	rc, err := wb.open(ref.path)
	if err != nil || rc == nil {
		return nil, fmt.Errorf("the sheet %q cannot be read: %v", name, err)
	}
	defer rc.Close()

	type cellAt struct {
		col  int
		text string
	}
	var rows []struct {
		num   int
		cells []cellAt
	}
	cells := 0
	dec := xml.NewDecoder(rc)
	rowNum := 0
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("the sheet %q: %w", name, err)
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "row" {
			continue
		}
		rowNum++
		for _, a := range start.Attr {
			if a.Name.Local == "r" {
				if n, err := strconv.Atoi(a.Value); err == nil {
					rowNum = n
				}
			}
		}
		if rowNum > maxSheetRows+1 {
			return nil, fmt.Errorf("the sheet %q has more than %d rows", name, maxSheetRows)
		}
		var row struct {
			Cells []xmlCell `xml:"c"`
		}
		if err := dec.DecodeElement(&row, &start); err != nil {
			return nil, fmt.Errorf("the sheet %q: %w", name, err)
		}
		var rowCells []cellAt
		next := 0
		for _, c := range row.Cells {
			col := next
			if c.Ref != "" {
				col = columnOf(c.Ref)
			}
			next = col + 1
			if col < 0 || col >= maxSheetCols {
				continue
			}
			if text := wb.cellText(c); text != "" {
				rowCells = append(rowCells, cellAt{col, text})
			}
		}
		if len(rowCells) == 0 {
			continue
		}
		cells += len(rowCells)
		if cells > maxCells {
			return nil, fmt.Errorf("the sheet %q has more than %d cells", name, maxCells)
		}
		rows = append(rows, struct {
			num   int
			cells []cellAt
		}{rowNum, rowCells})
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("the sheet %q is empty", name)
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].num < rows[j].num })
	minCol, maxCol := maxSheetCols, -1
	for _, r := range rows {
		for _, c := range r.cells {
			minCol = min(minCol, c.col)
			maxCol = max(maxCol, c.col)
		}
	}
	// rows in between without data stay out; the header is the first row with data
	out := make([][]string, len(rows))
	for i, r := range rows {
		line := make([]string, maxCol-minCol+1)
		for _, c := range r.cells {
			line[c.col-minCol] = c.text
		}
		out[i] = line
	}
	// a column of dates where some have a time: all with a time, so that it is one column of timestamps
	for col := range out[0] {
		dates, stamps := false, false
		for _, line := range out[1:] {
			dates = dates || isoDate.MatchString(line[col])
			stamps = stamps || isoStamp.MatchString(line[col])
		}
		if dates && stamps {
			for _, line := range out[1:] {
				if isoDate.MatchString(line[col]) {
					line[col] += " 00:00:00"
				}
			}
		}
	}
	// a header without a name: column_<n>
	for i, h := range out[0] {
		if strings.TrimSpace(h) == "" {
			out[0][i] = fmt.Sprintf("column_%d", i+1)
		}
	}
	return out, nil
}
