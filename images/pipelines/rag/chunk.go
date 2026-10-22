package rag

import (
	"strings"
	"unicode"
)

// Chunk is a fragment of a document, the unit that is embedded and
// searched.
type Chunk struct {
	Index    int
	Location string
	Content  string
}

// Chunk sizes, in characters. ~1500 characters is ~350–450 tokens, under
// the 512 tokens multilingual-e5-small reads; the overlap keeps a sentence
// cut between two chunks findable in either.
const (
	chunkMaxChars     = 1500
	chunkOverlapChars = 200
	chunkMinChars     = 40 // shorter leftovers are merged, not stored alone
)

// SplitIntoChunks cuts the sections into chunks of up to chunkMaxChars,
// on paragraph, then sentence, then word boundaries. A chunk never spans
// two sections, so its location stays exact.
func SplitIntoChunks(sections []Section) []Chunk {
	var chunks []Chunk
	for _, sec := range sections {
		for _, text := range splitSection(sec.Text) {
			chunks = append(chunks, Chunk{Index: len(chunks), Location: sec.Location, Content: text})
		}
	}
	return chunks
}

func splitSection(text string) []string {
	text = normalizeSpaces(text)
	if strings.TrimSpace(text) == "" {
		return nil
	}

	// Units no longer than chunkMaxChars: paragraphs, or the sentences
	// (or words) of a paragraph too long for one chunk.
	var units []string
	for _, para := range strings.Split(text, "\n\n") {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		if len(para) <= chunkMaxChars {
			units = append(units, para)
			continue
		}
		units = append(units, splitLong(para)...)
	}

	var out []string
	var cur strings.Builder
	for _, u := range units {
		if cur.Len() > 0 && cur.Len()+2+len(u) > chunkMaxChars {
			done := cur.String()
			out = append(out, done)
			cur.Reset()
			if tail := overlapTail(done); tail != "" && len(tail)+2+len(u) <= chunkMaxChars {
				cur.WriteString(tail)
			}
		}
		if cur.Len() > 0 {
			cur.WriteString("\n\n")
		}
		cur.WriteString(u)
	}
	if rest := strings.TrimSpace(cur.String()); rest != "" {
		if len(rest) < chunkMinChars && len(out) > 0 && len(out[len(out)-1])+2+len(rest) <= chunkMaxChars+chunkMinChars {
			out[len(out)-1] += "\n\n" + rest
		} else {
			out = append(out, rest)
		}
	}
	return out
}

// splitLong cuts a paragraph longer than chunkMaxChars at sentence ends,
// and a sentence still too long at spaces.
func splitLong(para string) []string {
	var sentences []string
	start := 0
	for i, r := range para {
		if (r == '.' || r == '!' || r == '?' || r == ';') && i+1 < len(para) && para[i+1] == ' ' {
			sentences = append(sentences, strings.TrimSpace(para[start:i+1]))
			start = i + 1
		}
	}
	if start < len(para) {
		sentences = append(sentences, strings.TrimSpace(para[start:]))
	}

	var out []string
	var cur strings.Builder
	add := func(s string) {
		if cur.Len() > 0 && cur.Len()+1+len(s) > chunkMaxChars {
			out = append(out, cur.String())
			cur.Reset()
		}
		if cur.Len() > 0 {
			cur.WriteString(" ")
		}
		cur.WriteString(s)
	}
	for _, s := range sentences {
		if len(s) <= chunkMaxChars {
			add(s)
			continue
		}
		for _, w := range hardWrap(s, chunkMaxChars) {
			add(w)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

// hardWrap cuts text at spaces into pieces of at most n bytes (or at n
// bytes, on a rune boundary, when there is no space).
func hardWrap(s string, n int) []string {
	var out []string
	for len(s) > n {
		cut := strings.LastIndexByte(s[:n], ' ')
		if cut <= 0 {
			cut = n
			for cut > 0 && !isRuneStart(s[cut]) {
				cut--
			}
		}
		out = append(out, strings.TrimSpace(s[:cut]))
		s = strings.TrimSpace(s[cut:])
	}
	if s != "" {
		out = append(out, s)
	}
	return out
}

func isRuneStart(b byte) bool { return b&0xC0 != 0x80 }

// overlapTail is the end of a chunk carried into the next one: the last
// ~chunkOverlapChars, starting at a word boundary.
func overlapTail(s string) string {
	if len(s) <= chunkOverlapChars {
		return ""
	}
	tail := s[len(s)-chunkOverlapChars:]
	if i := strings.IndexByte(tail, ' '); i >= 0 && i+1 < len(tail) {
		tail = tail[i+1:]
	}
	for len(tail) > 0 && !isRuneStart(tail[0]) {
		tail = tail[1:]
	}
	return "…" + strings.TrimSpace(tail)
}

// normalizeSpaces turns \r\n into \n, collapses runs of spaces and of
// blank lines, and trims each line: PDF text in particular comes with
// lots of layout whitespace.
func normalizeSpaces(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(text, "\n")
	var b strings.Builder
	blank := 0
	for _, line := range lines {
		line = strings.Join(strings.FieldsFunc(line, func(r rune) bool {
			return r == ' ' || r == '\t' || r == ' ' || (unicode.IsSpace(r) && r != '\n')
		}), " ")
		if line == "" {
			blank++
			continue
		}
		if b.Len() > 0 {
			if blank > 0 {
				b.WriteString("\n\n")
			} else {
				b.WriteString("\n")
			}
		}
		blank = 0
		b.WriteString(line)
	}
	return b.String()
}
