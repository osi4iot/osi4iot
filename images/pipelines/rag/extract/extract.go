// Package extract turns a document (text, PDF or Word .docx) into text
// sections. It has no CGO dependencies, so both pipelines (indexing the
// knowledge bases) and the doc_info MCP server (reading documents for
// the agents) use it.
package extract

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"strings"
	"unicode/utf8"
)

// Section is a piece of a document's text with where it comes from:
// "page 3" for a PDF, the heading for a Word document, "" for plain text.
type Section struct {
	Location string
	Text     string
}

// ErrUnsupportedFormat is returned for file types the knowledge bases do
// not index.
var ErrUnsupportedFormat = errors.New("unsupported document format")

// textExtensions are indexed as they are.
var textExtensions = map[string]bool{
	".txt": true, ".md": true, ".markdown": true, ".csv": true, ".tsv": true,
	".json": true, ".log": true, ".xml": true, ".yaml": true, ".yml": true,
	".html": true, ".htm": true, ".rst": true,
}

// SupportedExtension reports whether a file name has a format the
// knowledge bases index.
func SupportedExtension(name string) bool {
	ext := strings.ToLower(path.Ext(name))
	return textExtensions[ext] || ext == ".pdf" || ext == ".docx"
}

// Text returns a document's text, split into sections.
func Text(ctx context.Context, name string, data []byte) ([]Section, error) {
	ext := strings.ToLower(path.Ext(name))
	switch {
	case textExtensions[ext]:
		if !utf8.Valid(data) {
			return nil, fmt.Errorf("%s is not UTF-8 text", name)
		}
		return []Section{{Text: string(data)}}, nil
	case ext == ".pdf":
		return extractPDF(ctx, data)
	case ext == ".docx":
		return extractDOCX(data)
	default:
		return nil, fmt.Errorf("%w: %s (supported: text, .pdf, .docx)", ErrUnsupportedFormat, ext)
	}
}

// extractPDF runs pdftotext (poppler-utils), one section per page.
// pdftotext needs a file: the PDF is written to a temporary file that is
// removed straight away.
func extractPDF(ctx context.Context, data []byte) ([]Section, error) {
	bin, err := exec.LookPath("pdftotext")
	if err != nil {
		return nil, errors.New("pdftotext is not installed (package poppler-utils)")
	}
	tmp, err := os.CreateTemp("", "rag-*.pdf")
	if err != nil {
		return nil, fmt.Errorf("error creating a temporary file: %w", err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return nil, fmt.Errorf("error writing a temporary file: %w", err)
	}
	tmp.Close()

	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, bin, "-enc", "UTF-8", "-eol", "unix", tmp.Name(), "-")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdftotext failed: %v: %s", err, strings.TrimSpace(stderr.String()))
	}

	// pdftotext ends every page with a form feed.
	var sections []Section
	for i, page := range strings.Split(stdout.String(), "\f") {
		if strings.TrimSpace(page) == "" {
			continue
		}
		sections = append(sections, Section{Location: fmt.Sprintf("page %d", i+1), Text: page})
	}
	if len(sections) == 0 {
		return nil, errors.New("the PDF has no extractable text (a scanned document needs OCR)")
	}
	return sections, nil
}

// extractDOCX reads word/document.xml from the .docx (a zip): paragraphs
// become lines, and each heading starts a new section named after it.
func extractDOCX(data []byte) ([]Section, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("not a valid .docx file: %w", err)
	}
	var doc *zip.File
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			doc = f
			break
		}
	}
	if doc == nil {
		return nil, errors.New("not a valid .docx file: word/document.xml is missing")
	}
	rc, err := doc.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return parseDocumentXML(rc)
}

func parseDocumentXML(r io.Reader) ([]Section, error) {
	dec := xml.NewDecoder(r)
	var (
		sections  []Section
		current   = Section{}
		para      strings.Builder
		inText    bool
		isHeading bool
	)
	flushPara := func() {
		text := strings.TrimSpace(para.String())
		para.Reset()
		if text == "" {
			isHeading = false
			return
		}
		if isHeading {
			if strings.TrimSpace(current.Text) != "" {
				sections = append(sections, current)
			}
			current = Section{Location: "section: " + text, Text: text + "\n"}
		} else {
			current.Text += text + "\n"
		}
		isHeading = false
	}

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("error reading the .docx: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				para.WriteString("\t")
			case "br", "cr":
				para.WriteString("\n")
			case "pStyle":
				for _, a := range t.Attr {
					if a.Name.Local == "val" && isHeadingStyle(a.Value) {
						isHeading = true
					}
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				flushPara()
			case "tc": // table cell
				para.WriteString("\t")
			}
		case xml.CharData:
			if inText {
				para.Write(t)
			}
		}
	}
	flushPara()
	if strings.TrimSpace(current.Text) != "" {
		sections = append(sections, current)
	}
	if len(sections) == 0 {
		return nil, errors.New("the .docx has no text")
	}
	return sections, nil
}

// isHeadingStyle recognises Word's heading styles in English and Spanish
// ("Heading1", "Ttulo1", "Title"...).
func isHeadingStyle(style string) bool {
	s := strings.ToLower(style)
	return strings.HasPrefix(s, "heading") || strings.HasPrefix(s, "ttulo") ||
		strings.HasPrefix(s, "titulo") || s == "title"
}
