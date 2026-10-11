package function_library

import (
	"image/color"
	"pipelines/common"
)

type Color struct {
	node common.Node

	Black       color.Gray16
	White       color.Gray16
	Transparent color.Alpha16
	Opaque      color.Alpha16
}

func NewColor(node common.Node) *Color {
	return &Color{
		node: node,

		Black:       color.Black,
		White:       color.White,
		Transparent: color.Transparent,
		Opaque:      color.Opaque,
	}
}

func (col *Color) NewAlpha(a uint8) color.Alpha {
	return color.Alpha{A: a}
}

func (col *Color) NewAlpha16(a uint16) color.Alpha16 {
	return color.Alpha16{A: a}
}

func (col *Color) NewCMYK(c, m, y, k uint8) color.CMYK {
	return color.CMYK{C: c, M: m, Y: y, K: k}
}

func (col *Color) NewGray(g uint8) color.Gray {
	return color.Gray{Y: g}
}

func (col *Color) NewGray16(g uint16) color.Gray16 {
	return color.Gray16{Y: g}
}

func (col *Color) NewNRGBA(r, g, b, a uint8) color.NRGBA {
	return color.NRGBA{R: r, G: g, B: b, A: a}
}

func (col *Color) NewNRGBA64(r, g, b, a uint16) color.NRGBA64 {
	return color.NRGBA64{R: r, G: g, B: b, A: a}
}

func (col *Color) NewNYCbCrA(y, cb, cr, a uint8) color.NYCbCrA {
	return color.NYCbCrA{YCbCr: color.YCbCr{Y: y, Cb: cb, Cr: cr}, A: a}
}

func (col *Color) NewPalette(colors []color.Color) color.Palette {
	return color.Palette(colors)
}

func (col *Color) NewRGBA(r, g, b, a uint8) color.RGBA {
	return color.RGBA{R: r, G: g, B: b, A: a}
}

func (col *Color) NewRGBA64(r, g, b, a uint16) color.RGBA64 {
	return color.RGBA64{R: r, G: g, B: b, A: a}
}

func (col *Color) NewYCbCr(y, cb, cr uint8) color.YCbCr {
	return color.YCbCr{Y: y, Cb: cb, Cr: cr}
}

func (col *Color) CMYKToRGB(c, m, y, k uint8) (uint8, uint8, uint8) {
	return color.CMYKToRGB(c, m, y, k)
}

func (col *Color) ModelFunc(f func(color.Color) color.Color) color.Model {
	return color.ModelFunc(f)
}

func (col *Color) RGBToCMYK(r, g, b uint8) (uint8, uint8, uint8, uint8) {
	return color.RGBToCMYK(r, g, b)
}

func (col *Color) RGBToYCbCr(r, g, b uint8) (uint8, uint8, uint8) {
	return color.RGBToYCbCr(r, g, b)
}

func (col *Color) YCbCrToRGB(y, cb, cr uint8) (uint8, uint8, uint8) {
	return color.YCbCrToRGB(y, cb, cr)
}
