package rag

import (
	"archive/zip"
	"bytes"
	"context"
	"os/exec"
	"strings"
	"testing"
	"unicode/utf8"
)

func makeDOCX(t *testing.T, body string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("word/document.xml")
	if err != nil {
		t.Fatal(err)
	}
	w.Write([]byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` + body + `</w:body></w:document>`))
	zw.Close()
	return buf.Bytes()
}

func para(style, text string) string {
	pPr := ""
	if style != "" {
		pPr = `<w:pPr><w:pStyle w:val="` + style + `"/></w:pPr>`
	}
	return `<w:p>` + pPr + `<w:r><w:t>` + text + `</w:t></w:r></w:p>`
}

func TestExtractDOCX(t *testing.T) {
	data := makeDOCX(t, para("Ttulo1", "Mantenimiento")+para("", "Revisar la válvula V3 cada 500 h.")+
		para("Heading2", "Seguridad")+para("", "Usar guantes.")+para("", "Parar el motor."))
	sections, err := ExtractText(context.Background(), "manual.docx", data)
	if err != nil {
		t.Fatal(err)
	}
	if len(sections) != 2 {
		t.Fatalf("got %d sections: %+v", len(sections), sections)
	}
	if sections[0].Location != "section: Mantenimiento" || !strings.Contains(sections[0].Text, "válvula V3") {
		t.Fatalf("section 0: %+v", sections[0])
	}
	if sections[1].Location != "section: Seguridad" || !strings.Contains(sections[1].Text, "Parar el motor.") {
		t.Fatalf("section 1: %+v", sections[1])
	}
}

func TestExtractUnsupported(t *testing.T) {
	if _, err := ExtractText(context.Background(), "old.doc", []byte("x")); err == nil {
		t.Fatal("expected an error for .doc")
	}
	if SupportedExtension("a.DOC") || !SupportedExtension("a.PDF") || !SupportedExtension("notes.md") {
		t.Fatal("SupportedExtension")
	}
}

func TestExtractPDF(t *testing.T) {
	if _, err := exec.LookPath("pdftotext"); err != nil {
		t.Skip("pdftotext not installed")
	}
	sections, err := ExtractText(context.Background(), "x.pdf", minimalPDF("Hola mundo"))
	if err != nil {
		t.Fatal(err)
	}
	if len(sections) != 1 || sections[0].Location != "page 1" || !strings.Contains(sections[0].Text, "Hola mundo") {
		t.Fatalf("%+v", sections)
	}
}

// minimalPDF builds a one-page PDF with one line of text.
func minimalPDF(text string) []byte {
	content := "BT /F1 12 Tf 72 720 Td (" + text + ") Tj ET"
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		"<< /Length " + itoa(len(content)) + " >>\nstream\n" + content + "\nendstream",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs))
	for i, o := range objs {
		offsets[i] = b.Len()
		b.WriteString(itoa(i + 1));b.WriteString(" 0 obj\n");b.WriteString(o);b.WriteString("\nendobj\n")
	}
	xref := b.Len()
	b.WriteString("xref\n0 ");b.WriteString(itoa(len(objs) + 1));b.WriteString("\n0000000000 65535 f \n")
	for _, off := range offsets {
		s := itoa(off)
		b.WriteString(strings.Repeat("0", 10-len(s)));b.WriteString(s);b.WriteString(" 00000 n \n")
	}
	b.WriteString("trailer\n<< /Size ");b.WriteString(itoa(len(objs) + 1));b.WriteString(" /Root 1 0 R >>\nstartxref\n");b.WriteString(itoa(xref));b.WriteString("\n%%EOF\n")
	return b.Bytes()
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

func TestChunking(t *testing.T) {
	// Short text: one chunk, location kept.
	ch := SplitIntoChunks([]Section{{Location: "page 1", Text: "Uno.\n\nDos."}})
	if len(ch) != 1 || ch[0].Location != "page 1" || ch[0].Content != "Uno.\n\nDos." {
		t.Fatalf("%+v", ch)
	}

	// Long text: several chunks, none over the limit, overlap present,
	// valid UTF-8, indexes consecutive across sections.
	var long strings.Builder
	for i := 0; i < 60; i++ {
		long.WriteString("La válvula de seguridad número ")
		long.WriteString(itoa(i))
		long.WriteString(" se revisa cada quinientas horas de funcionamiento. ")
		if i%7 == 6 {
			long.WriteString("\n\n")
		}
	}
	ch = SplitIntoChunks([]Section{{Location: "page 1", Text: long.String()}, {Location: "page 2", Text: "Fin."}})
	if len(ch) < 3 {
		t.Fatalf("expected several chunks, got %d", len(ch))
	}
	for i, c := range ch {
		if c.Index != i {
			t.Fatalf("chunk %d has index %d", i, c.Index)
		}
		if len(c.Content) > chunkMaxChars+chunkOverlapChars+10 {
			t.Fatalf("chunk %d too long: %d", i, len(c.Content))
		}
		if !utf8.ValidString(c.Content) {
			t.Fatalf("chunk %d is not valid UTF-8", i)
		}
	}
	if !strings.HasPrefix(ch[1].Content, "…") {
		t.Fatalf("chunk 1 should start with the overlap: %q", ch[1].Content[:40])
	}
	if last := ch[len(ch)-1]; last.Location != "page 2" || last.Content != "Fin." {
		t.Fatalf("last chunk: %+v", last)
	}

	// A single huge word-less run is cut on rune boundaries.
	ch = SplitIntoChunks([]Section{{Text: strings.Repeat("ñ", 2000)}})
	for _, c := range ch {
		if !utf8.ValidString(c.Content) {
			t.Fatal("hard cut broke a rune")
		}
	}
}

func TestVectorLiteral(t *testing.T) {
	if got := vectorLiteral([]float32{0.5, -1, 0.25}); got != "[0.5,-1,0.25]" {
		t.Fatal(got)
	}
}
