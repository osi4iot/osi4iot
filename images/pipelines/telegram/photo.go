package telegram

import (
	"image"
	"image/color"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

var (
	colorOK      = color.RGBA{R: 39, G: 174, B: 96, A: 255}  // green
	colorAlert   = color.RGBA{R: 231, G: 76, B: 60, A: 255}   // red
	colorUnknown = color.RGBA{R: 149, G: 165, B: 166, A: 255} // gray
	colorWarning = color.RGBA{R: 241, G: 196, B: 15, A: 255}   // yellow
	colorHeader  = color.RGBA{R: 44, G: 62, B: 80, A: 255}    // dark blue
	colorRowEven = color.RGBA{R: 236, G: 240, B: 241, A: 255} // light gray
	colorRowOdd  = color.RGBA{R: 255, G: 255, B: 255, A: 255} // white
	colorText    = color.RGBA{R: 30, G: 30, B: 30, A: 255}    // near black
	colorWhite   = color.RGBA{R: 255, G: 255, B: 255, A: 255}
	colorBorder  = color.RGBA{R: 189, G: 195, B: 199, A: 255}
	colorBg      = color.RGBA{R: 245, G: 246, B: 250, A: 255}
)

const (
	imgPadding = 16
	rowH       = 28
	headerH    = 36
	titleH     = 40
	colMinW    = 80  // minimum column width in px
	colCharW   = 8   // approximate px per character (basicfont 7x13)
	colPadX    = 16  // left+right cell padding
	dotR       = 6   // status dot radius
	fontH      = 13  // font baseline offset
)

func isStatusHeader(h string) bool {
	return strings.EqualFold(h, "status")
}

func statusStyle(s string) (color.RGBA, string) {
	switch strings.ToLower(s) {
	case "ok":
		return colorOK, "OK"
	case "alert":
		return colorAlert, "Alert"
	case "warning":
		return colorWarning, "Warning"
	default:
		return colorUnknown, "Unknown"
	}
}

func fillRect(img *image.RGBA, r image.Rectangle, c color.RGBA) {
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			img.SetRGBA(x, y, c)
		}
	}
}

func drawRect(img *image.RGBA, r image.Rectangle, c color.RGBA) {
	drawHorizLine(img, r.Min.X, r.Max.X, r.Min.Y, c)
	drawHorizLine(img, r.Min.X, r.Max.X, r.Max.Y, c)
	drawVertLine(img, r.Min.X, r.Min.Y, r.Max.Y, c)
	drawVertLine(img, r.Max.X, r.Min.Y, r.Max.Y, c)
}

func drawHorizLine(img *image.RGBA, x0, x1, y int, c color.RGBA) {
	for x := x0; x <= x1; x++ {
		img.SetRGBA(x, y, c)
	}
}

func drawVertLine(img *image.RGBA, x, y0, y1 int, c color.RGBA) {
	for y := y0; y <= y1; y++ {
		img.SetRGBA(x, y, c)
	}
}

func drawText(img *image.RGBA, s string, x, y int, c color.RGBA) {
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(c),
		Face: basicfont.Face7x13,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(s)
}

func drawCircle(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			dx, dy := x-cx, y-cy
			if dx*dx+dy*dy <= r*r {
				img.SetRGBA(x, y, c)
			}
		}
	}
}

func sum(s []int) int {
	t := 0
	for _, v := range s {
		t += v
	}
	return t
}