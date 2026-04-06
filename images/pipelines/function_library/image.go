package function_library

import (
	"bytes"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"pipelines/common"

	"github.com/nfnt/resize"
)

type Image struct {
	node common.Node

	UniformBlack       *image.Uniform
	UniformWhite       *image.Uniform
	UniformTransparent *image.Uniform
	UniformOpaque      *image.Uniform
}

func NewImage(node common.Node) *Image {
	return &Image{
		node: node,

		UniformBlack:       image.Black,
		UniformWhite:       image.White,
		UniformTransparent: image.Transparent,
		UniformOpaque:      image.Opaque,
	}
}

func (img *Image) DecodeImageFromBase64(imageStr string) image.Image {
	// Decodificar el string base64
	imageData, err := base64.StdEncoding.DecodeString(imageStr)
	if err != nil {
		img.node.HandleError(fmt.Errorf("error decoding base64 string: %w", err))
		return nil
	}

	// Crear un reader desde los bytes decodificados
	reader := bytes.NewReader(imageData)

	// Decodificar la imagen
	pic, _, err := image.Decode(reader)
	if err != nil {
		img.node.HandleError(fmt.Errorf("error decoding image from bytes: %w", err))
		return nil
	}

	return pic
}

func (img *Image) DecodeImageFromFile(filename string) image.Image {
	file, err := os.Open(filename)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to open file %s: %v", filename, err))
		return nil
	}
	defer file.Close()

	pic, _, err := image.Decode(file)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to decode image from file %s: %v", filename, err))
		return nil
	}

	return pic
}

func (img *Image) EncodeImageToBase64(pic image.Image, format string, quality int) string {
	var buf bytes.Buffer

	switch format {
	case "jpeg", "jpg":
		options := &jpeg.Options{Quality: quality}
		if err := jpeg.Encode(&buf, pic, options); err != nil {
			img.node.HandleError(fmt.Errorf("error encoding image as JPEG: %w", err))
			return ""
		}
	case "png":
		if err := png.Encode(&buf, pic); err != nil {
			img.node.HandleError(fmt.Errorf("error encoding image as PNG: %w", err))
			return ""
		}
	case "gif":
		options := &gif.Options{NumColors: 256, Quantizer: nil, Drawer: nil}
		if err := gif.Encode(&buf, pic, options); err != nil {
			img.node.HandleError(fmt.Errorf("error encoding image as GIF: %w", err))
			return ""
		}
	default:
		img.node.HandleError(fmt.Errorf("unsupported format: %s. Use 'jpeg' or 'png'", format))
		return ""
	}

	base64String := base64.StdEncoding.EncodeToString(buf.Bytes())
	jsonBytes, err := json.Marshal(base64String)
	if err != nil {
		img.node.HandleError(fmt.Errorf("error marshaling to JSON: %w", err))
		return ""
	}

	return string(jsonBytes)
}

func (img *Image) EncodeImageToFile(filename string, format string, src image.Image) {
	file, err := os.Create(filename)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to create file %s: %v", filename, err))
		return
	}
	defer file.Close()

	switch format {
	case "jpeg", "jpg":
		options := &jpeg.Options{Quality: 80}
		err = jpeg.Encode(file, src, options)
		if err != nil {
			img.node.HandleError(fmt.Errorf("failed to encode JPEG: %v", err))
		}
	case "png":
		err = png.Encode(file, src)
		if err != nil {
			img.node.HandleError(fmt.Errorf("failed to encode PNG: %v", err))
		}
	case "gif":
		options := &gif.Options{NumColors: 256, Quantizer: nil, Drawer: nil}
		err = gif.Encode(file, src, options)
		if err != nil {
			img.node.HandleError(fmt.Errorf("failed to encode GIF: %v", err))
		}
	default:
		img.node.HandleError(fmt.Errorf("unsupported format: %s. Use 'jpeg', 'png' or 'gif'", format))
	}
}

func (img *Image) NewAlpha(r image.Rectangle) *image.Alpha {
	return image.NewAlpha(r)
}

func (img *Image) NewAlpha16(r image.Rectangle) *image.Alpha16 {
	return image.NewAlpha16(r)
}

func (img *Image) NewCMYK(r image.Rectangle) *image.CMYK {
	return image.NewCMYK(r)
}

func (img *Image) NewGray(r image.Rectangle) *image.Gray {
	return image.NewGray(r)
}

func (img *Image) NewGray16(r image.Rectangle) *image.Gray16 {
	return image.NewGray16(r)
}

func (img *Image) NewNRGBA(r image.Rectangle) *image.NRGBA {
	return image.NewNRGBA(r)
}

func (img *Image) NewNRGBA64(r image.Rectangle) *image.NRGBA64 {
	return image.NewNRGBA64(r)
}

func (img *Image) NewNYCbCrA(r image.Rectangle, subsampleRatio image.YCbCrSubsampleRatio) *image.NYCbCrA {
	return image.NewNYCbCrA(r, subsampleRatio)
}

func (img *Image) NewPaletted(r image.Rectangle, p color.Palette) *image.Paletted {
	return image.NewPaletted(r, p)
}

func (img *Image) NewRGBA(r image.Rectangle) *image.RGBA {
	return image.NewRGBA(r)
}

func (img *Image) NewRGBA64(r image.Rectangle) *image.RGBA64 {
	return image.NewRGBA64(r)
}

func (img *Image) NewUniform(c color.Color) *image.Uniform {
	return image.NewUniform(c)
}

func (img *Image) NewYCbCr(r image.Rectangle, subsampleRatio image.YCbCrSubsampleRatio) *image.YCbCr {
	return image.NewYCbCr(r, subsampleRatio)
}

// Geometry functions
func (img *Image) Rect(x0, y0, x1, y1 int) image.Rectangle {
	return image.Rect(x0, y0, x1, y1)
}

func (img *Image) Point(x, y int) image.Point {
	return image.Point{X: x, Y: y}
}

func (img *Image) PixelsConvertion(pic image.Image, channelSize int, imgWidth int, imgHeight int) []float32 {
	data := make([]float32, channelSize*3)
	redChannel := data[0:channelSize]
	greenChannel := data[channelSize : channelSize*2]
	blueChannel := data[channelSize*2 : channelSize*3]

	i := 0
	for y := 0; y < imgHeight; y++ {
		for x := 0; x < imgWidth; x++ {
			r, g, b, _ := pic.At(x, y).RGBA()
			redChannel[i] = float32(r>>8) / 255.0
			greenChannel[i] = float32(g>>8) / 255.0
			blueChannel[i] = float32(b>>8) / 255.0
			i++
		}
	}

	return data
}

// Resize functions - return image.Image
func (img *Image) GetInterpolationFunction(method string) resize.InterpolationFunction {
	switch method {
	case "NearestNeighbor":
		return resize.NearestNeighbor
	case "Bilinear":
		return resize.Bilinear
	case "Bicubic":
		return resize.Bicubic
	case "MitchellNetravali":
		return resize.MitchellNetravali
	case "Lanczos2":
		return resize.Lanczos2
	case "Lanczos3":
		return resize.Lanczos3
	default:
		img.node.HandleError(fmt.Errorf("unsupported interpolation method: %s. Use 'NearestNeighbor', 'Bilinear', 'Bicubic', 'MitchellNetravali', 'Lanczos2' or 'Lanczos3'", method))
		return resize.NearestNeighbor
	}
}

func (img *Image) Resize(pic image.Image, width uint, height uint, interp resize.InterpolationFunction) image.Image {
	return resize.Resize(width, height, pic, interp)
}

func (img *Image) Thumbnail(maxWidth, maxHeight uint, src image.Image, interp resize.InterpolationFunction) image.Image {
	return resize.Thumbnail(maxWidth, maxHeight, src, interp)
}

// Draw functions
func (img *Image) GetDrawOp(op string) draw.Op {
	switch op {
	case "Over":
		return draw.Over
	case "Src":
		return draw.Src
	default:
		img.node.HandleError(fmt.Errorf("unsupported draw operation: %s. Use 'Over' or 'Src'", op))
		return draw.Over
	}
}

func (img *Image) Draw(dst draw.Image, r image.Rectangle, src image.Image, sp image.Point, op draw.Op) {
	draw.Draw(dst, r, src, sp, op)
}

func (img *Image) DrawMask(dst draw.Image, r image.Rectangle, src image.Image, sp image.Point, mask image.Image, mp image.Point, op draw.Op) {
	draw.DrawMask(dst, r, src, sp, mask, mp, op)
}
