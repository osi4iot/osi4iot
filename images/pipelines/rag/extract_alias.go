package rag

import (
	"context"

	"pipelines/rag/extract"
)

// The text extraction lives in rag/extract, which doc_info uses too.

// Section is a piece of a document's text with where it comes from.
type Section = extract.Section

// ErrUnsupportedFormat is returned for file types that are not indexed.
var ErrUnsupportedFormat = extract.ErrUnsupportedFormat

// SupportedExtension reports whether a file name has a format the
// knowledge bases index.
func SupportedExtension(name string) bool { return extract.SupportedExtension(name) }

// ExtractText returns a document's text, split into sections.
func ExtractText(ctx context.Context, name string, data []byte) ([]Section, error) {
	return extract.Text(ctx, name, data)
}
