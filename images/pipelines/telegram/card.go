package telegram

import (
	"bytes"
	"image"
	"image/png"
	"strings"
)

// Card holds the data needed to render an asset information card for Telegram messages. 
// The GenerateCardImage method produces a PNG image from this data.
type Card struct {
	Title  string // shown in the top header bar (e.g. asset name)
	Fields []CardField
}

type CardField struct {
	Label string
	Value string
}

const (
	cardLabelColW = 140 // fixed width for the label column (px)
	cardValueColW = 280 // fixed width for the value column (px)
	cardRowH      = 30  // height of a single-line field row (px)
	cardLineH     = 18  // line height inside a multiline cell (px)
	cardHeaderH   = 40  // height of the title bar (px)
	cardPadX      = 12  // horizontal padding inside cells
	cardPadY      = 10  // top/bottom outer padding
	cardCellPadV  = 8   // top+bottom vertical padding inside a multiline cell
)

// isMultilineField returns true for labels that should wrap instead of truncate.
func isMultilineField(label string) bool {
	return strings.EqualFold(label, "state description")
}

// wrapText splits s into lines that fit within maxPx pixels.
// It breaks on word boundaries when possible.
func wrapText(s string, maxPx int) []string {
	maxChars := maxPx / colCharW
	if maxChars < 1 {
		maxChars = 1
	}

	words := strings.Fields(s)
	if len(words) == 0 {
		return []string{""}
	}

	var lines []string
	current := ""

	for _, w := range words {
		candidate := w
		if current != "" {
			candidate = current + " " + w
		}
		if len([]rune(candidate)) <= maxChars {
			current = candidate
		} else {
			if current != "" {
				lines = append(lines, current)
			}
			// word itself longer than maxChars → hard-break it
			runes := []rune(w)
			for len(runes) > maxChars {
				lines = append(lines, string(runes[:maxChars]))
				runes = runes[maxChars:]
			}
			current = string(runes)
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

// rowHeight returns the pixel height for a field row.
func rowHeight(f CardField) int {
	if isMultilineField(f.Label) {
		lines := wrapText(f.Value, cardValueColW-cardPadX*2)
		n := len(lines)
		if n == 0 {
			n = 1
		}
		return n*cardLineH + cardCellPadV
	}
	return cardRowH
}

// GenerateCardImage renders the Card as a PNG and returns the encoded bytes,
// ready to pass to SendTelegramPhoto.
func (c *Card) GenerateCardImage() ([]byte, error) {
	// ── pre-compute each row's height ────────────────────────────────────────
	rowHeights := make([]int, len(c.Fields))
	totalRowsH := 0
	for i, f := range c.Fields {
		h := rowHeight(f)
		rowHeights[i] = h
		totalRowsH += h
	}
	if len(c.Fields) == 0 {
		totalRowsH = cardRowH
	}

	totalW := imgPadding*2 + cardLabelColW + cardValueColW
	totalH := cardHeaderH + cardPadY + totalRowsH + cardPadY

	img := image.NewRGBA(image.Rect(0, 0, totalW, totalH))

	// ── background ───────────────────────────────────────────────────────────
	fillRect(img, image.Rect(0, 0, totalW, totalH), colorBg)

	// ── title / header bar ───────────────────────────────────────────────────
	fillRect(img, image.Rect(0, 0, totalW, cardHeaderH), colorHeader)
	drawText(img, c.Title, imgPadding, cardHeaderH/2+fontH/2, colorWhite)

	tableX := imgPadding
	tableY := cardHeaderH + cardPadY
	tableW := cardLabelColW + cardValueColW
	divX := tableX + cardLabelColW
	valueX := divX + cardPadX

	// ── field rows ───────────────────────────────────────────────────────────
	y := tableY
	for i, f := range c.Fields {
		h := rowHeights[i]

		// alternating row background
		bg := colorRowOdd
		if i%2 == 1 {
			bg = colorRowEven
		}
		fillRect(img, image.Rect(tableX, y, tableX+tableW, y+h), bg)

		// vertical divider
		drawVertLine(img, divX, y, y+h, colorBorder)

		if isMultilineField(f.Label) {
			// label vertically centered
			labelBaseline := y + h/2 + fontH/2
			drawText(img, f.Label, tableX+cardPadX, labelBaseline, colorText)

			// value: one line per wrapped segment
			lines := wrapText(f.Value, cardValueColW-cardPadX*2)
			for li, line := range lines {
				lineBaseline := y + cardCellPadV/2 + li*cardLineH + cardLineH/2 + fontH/2
				drawText(img, line, valueX, lineBaseline, colorText)
			}
		} else {
			textBaseline := y + h/2 + fontH/2

			// label
			drawText(img, f.Label, tableX+cardPadX, textBaseline, colorText)

			// value — status-aware
			if isStatusHeader(f.Label) {
				sc, label := statusStyle(f.Value)
				dotX := valueX + dotR
				dotY := y + h/2
				drawCircle(img, dotX, dotY, dotR, sc)
				drawText(img, label, dotX+dotR+6, textBaseline, colorText)
			} else {
				val := truncate(f.Value, cardValueColW-cardPadX*2)
				drawText(img, val, valueX, textBaseline, colorText)
			}
		}

		// horizontal row separator
		drawHorizLine(img, tableX, tableX+tableW, y+h, colorBorder)

		y += h
	}

	// ── outer border ─────────────────────────────────────────────────────────
	tableBottom := tableY + totalRowsH
	drawRect(img, image.Rect(tableX, tableY, tableX+tableW, tableBottom), colorBorder)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// truncate cuts s so that it fits within maxPx pixels (using colCharW per rune).
func truncate(s string, maxPx int) string {
	maxChars := maxPx / colCharW
	runes := []rune(s)
	if len(runes) <= maxChars {
		return s
	}
	if maxChars < 3 {
		return strings.Repeat(".", maxChars)
	}
	return string(runes[:maxChars-1]) + "…"
}