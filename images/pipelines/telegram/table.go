package telegram

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"strings"
)

type Table struct {
	Headers []string
	Rows    [][]string
}

func (t *Table) RenderTable() string {
     // Calcular anchos de columna
    widths := make([]int, len(t.Headers))
    for i, h := range t.Headers {
        widths[i] = len(h)
    }
    for _, row := range t.Rows {
        for i, cell := range row {
            if len(cell) > widths[i] {
                widths[i] = len(cell)
            }
        }
    }

    // Helpers para construir líneas
    hLine := func(left, mid, right, fill string) string {
        var sb strings.Builder
        sb.WriteString(left)
        for i, w := range widths {
            sb.WriteString(strings.Repeat(fill, w+2))
            if i < len(widths)-1 {
                sb.WriteString(mid)
            }
        }
        sb.WriteString(right + "\n")
        return sb.String()
    }

    rowLine := func(cells []string) string {
        var sb strings.Builder
        sb.WriteString("│")
        for i, cell := range cells {
            sb.WriteString(fmt.Sprintf(" %-*s │", widths[i], cell))
        }
        sb.WriteString("\n")
        return sb.String()
    }

    var sb strings.Builder
    sb.WriteString(hLine("┌", "┬", "┐", "─")) // top
    sb.WriteString(rowLine(t.Headers))
    sb.WriteString(hLine("├", "┼", "┤", "─")) // separador header
    for _, row := range t.Rows {
        sb.WriteString(rowLine(row))
    }
    sb.WriteString(hLine("└", "┴", "┘", "─")) // bottom

    return "<pre>" + sb.String() + "</pre>"
}

// GenerateTableImage renders a Table as a PNG and returns the encoded bytes,
// ready to pass to SendTelegramPhoto.
// title is optional; pass "" to omit the title bar.
func (t *Table) GenerateTableImage(title string) ([]byte, error) {
	nCols := len(t.Headers)
	if nCols == 0 {
		nCols = 1
	}

	// ── compute column widths from content ───────────────────────────────────
	colW := make([]int, nCols)
	for i, h := range t.Headers {
		w := len([]rune(h))*colCharW + colPadX
		if w < colMinW {
			w = colMinW
		}
		colW[i] = w
	}
	for _, row := range t.Rows {
		for i := 0; i < nCols && i < len(row); i++ {
			w := len([]rune(row[i]))*colCharW + colPadX
			// status column needs room for dot + text
			if isStatusHeader(t.Headers[i]) {
				w += dotR*2 + 6
			}
			if w > colW[i] {
				colW[i] = w
			}
		}
	}

	tableW := sum(colW)
	totalW := tableW + imgPadding*2

	hasTitleBar := title != ""
	tBarH := 0
	if hasTitleBar {
		tBarH = titleH
	}
	totalH := tBarH + headerH + rowH*len(t.Rows) + imgPadding*2

	img := image.NewRGBA(image.Rect(0, 0, totalW, totalH))

	// ── background ───────────────────────────────────────────────────────────
	fillRect(img, image.Rect(0, 0, totalW, totalH), colorBg)

	// ── title bar ────────────────────────────────────────────────────────────
	if hasTitleBar {
		fillRect(img, image.Rect(0, 0, totalW, tBarH), colorHeader)
		drawText(img, title, imgPadding, tBarH/2+fontH/2, colorWhite)
	}

	tableX := imgPadding
	tableY := tBarH + imgPadding

	// ── header row ───────────────────────────────────────────────────────────
	fillRect(img, image.Rect(tableX, tableY, tableX+tableW, tableY+headerH), colorHeader)
	cx := tableX
	for i, h := range t.Headers {
		drawText(img, h, cx+8, tableY+headerH/2+fontH/2, colorWhite)
		cx += colW[i]
	}

	// ── data rows ────────────────────────────────────────────────────────────
	for ri, row := range t.Rows {
		y := tableY + headerH + ri*rowH
		bg := colorRowOdd
		if ri%2 == 1 {
			bg = colorRowEven
		}
		fillRect(img, image.Rect(tableX, y, tableX+tableW, y+rowH), bg)

		cy := y + rowH/2 + fontH/2 // text baseline (vertical center)
		cx = tableX

		for ci := 0; ci < nCols; ci++ {
			cell := ""
			if ci < len(row) {
				cell = row[ci]
			}

			if ci > 0 {
				drawVertLine(img, cx, y, y+rowH, colorBorder)
			}

			if isStatusHeader(t.Headers[ci]) {
				sc, label := statusStyle(cell)
				dotX := cx + 10 + dotR
				dotY := y + rowH/2
				drawCircle(img, dotX, dotY, dotR, sc)
				drawText(img, label, dotX+dotR+6, cy, colorText)
			} else {
				drawText(img, cell, cx+8, cy, colorText)
			}

			cx += colW[ci]
		}

		// horizontal row separator
		drawHorizLine(img, tableX, tableX+tableW, y+rowH, colorBorder)
	}

	// ── outer border ─────────────────────────────────────────────────────────
	tableBottom := tableY + headerH + rowH*len(t.Rows)
	drawRect(img, image.Rect(tableX, tableY, tableX+tableW, tableBottom), colorBorder)
	drawHorizLine(img, tableX, tableX+tableW, tableY+headerH, colorBorder)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}