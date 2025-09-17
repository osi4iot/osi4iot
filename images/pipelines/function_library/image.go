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
	"image/jpeg"
	"image/png"
	"os"
	"pipelines/common"
	"sort"
	"sync"

	"github.com/nfnt/resize"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

//go:embed assets/fonts/LiberationSans-Regular.ttf
var embeddedFont []byte

var (
	otFont    *opentype.Font
	faceCache = struct {
		sync.RWMutex
		m map[float64]font.Face // clave: tamaño en puntos
	}{m: make(map[float64]font.Face)}
	otOnce sync.Once
	otErr  error
)

var YoloClasses = []string{
	"person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
	"traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse",
	"sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie",
	"suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
	"skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon",
	"bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut",
	"cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
	"remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
	"clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
}

func initEmbeddedFont() error {
	otOnce.Do(func() {
		otFont, otErr = opentype.Parse(embeddedFont)
	})
	return otErr
}

func faceAt(size float64) (font.Face, error) {
	if err := initEmbeddedFont(); err != nil {
		return nil, err
	}
	faceCache.RLock()
	if f, ok := faceCache.m[size]; ok {
		faceCache.RUnlock()
		return f, nil
	}
	faceCache.RUnlock()

	face, err := opentype.NewFace(otFont, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return nil, err
	}
	faceCache.Lock()
	if old, ok := faceCache.m[size]; ok {
		faceCache.Unlock()
		face.Close() // ya existía; cerramos el nuevo
		return old, nil
	}
	faceCache.m[size] = face
	faceCache.Unlock()
	return face, nil
}

type BoundingBox struct {
	Label          string
	Confidence     float32
	X1, Y1, X2, Y2 float32
}

func (b *BoundingBox) ToRect() image.Rectangle {
	return image.Rect(int(b.X1), int(b.Y1), int(b.X2), int(b.Y2)).Canon()
}

// Returns the area of b in pixels, after converting to an image.Rectangle.
func (b *BoundingBox) RectArea() int {
	size := b.ToRect().Size()
	return size.X * size.Y
}

func (b *BoundingBox) Intersection(other *BoundingBox) float32 {
	r1 := b.ToRect()
	r2 := other.ToRect()
	intersected := r1.Intersect(r2).Canon().Size()
	return float32(intersected.X * intersected.Y)
}

func (b *BoundingBox) Union(other *BoundingBox) float32 {
	intersectArea := b.Intersection(other)
	totalArea := float32(b.RectArea() + other.RectArea())
	return totalArea - intersectArea
}

func (b *BoundingBox) Iou(other *BoundingBox) float32 {
	return b.Intersection(other) / b.Union(other)
}


type Image struct {
	node common.Node

	// Color models - siguiendo el patrón de constantes como en Time
	RGBAModel    color.Model
	RGBA64Model  color.Model
	NRGBAModel   color.Model
	NRGBA64Model color.Model
	AlphaModel   color.Model
	Alpha16Model color.Model
	GrayModel    color.Model
	Gray16Model  color.Model

	// Resize interpolation constants
	NearestNeighbor   resize.InterpolationFunction
	Bilinear          resize.InterpolationFunction
	Bicubic           resize.InterpolationFunction
	MitchellNetravali resize.InterpolationFunction
	Lanczos2          resize.InterpolationFunction
	Lanczos3          resize.InterpolationFunction

	// Common colors
	Black       color.Color
	White       color.Color
	Transparent color.Color
	Opaque      color.Color

	DrawSrc  draw.Op
	DrawOver draw.Op
}

func NewImage(node common.Node) *Image {
	return &Image{
		node: node,

		// Color models
		RGBAModel:    color.RGBAModel,
		RGBA64Model:  color.RGBA64Model,
		NRGBAModel:   color.NRGBAModel,
		NRGBA64Model: color.NRGBA64Model,
		AlphaModel:   color.AlphaModel,
		Alpha16Model: color.Alpha16Model,
		GrayModel:    color.GrayModel,
		Gray16Model:  color.Gray16Model,

		// Resize interpolations
		NearestNeighbor:   resize.NearestNeighbor,
		Bilinear:          resize.Bilinear,
		Bicubic:           resize.Bicubic,
		MitchellNetravali: resize.MitchellNetravali,
		Lanczos2:          resize.Lanczos2,
		Lanczos3:          resize.Lanczos3,

		// Common colors
		Black:       color.Black,
		White:       color.White,
		Transparent: color.Transparent,
		Opaque:      color.Opaque,
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

func (img *Image) NewRGBA(r image.Rectangle) image.Image {
	return image.NewRGBA(r)
}

func (img *Image) NewRGBA64(r image.Rectangle) image.Image {
	return image.NewRGBA64(r)
}

func (img *Image) NewNRGBA(r image.Rectangle) image.Image {
	return image.NewNRGBA(r)
}

func (img *Image) NewNRGBA64(r image.Rectangle) image.Image {
	return image.NewNRGBA64(r)
}

func (img *Image) NewAlpha(r image.Rectangle) image.Image {
	return image.NewAlpha(r)
}

func (img *Image) NewAlpha16(r image.Rectangle) image.Image {
	return image.NewAlpha16(r)
}

func (img *Image) NewGray(r image.Rectangle) image.Image {
	return image.NewGray(r)
}

func (img *Image) NewGray16(r image.Rectangle) image.Image {
	return image.NewGray16(r)
}

func (img *Image) NewPaletted(r image.Rectangle, p color.Palette) image.Image {
	return image.NewPaletted(r, p)
}

// Geometry functions
func (img *Image) Rect(x0, y0, x1, y1 int) image.Rectangle {
	return image.Rect(x0, y0, x1, y1)
}

func (img *Image) Point(x, y int) image.Point {
	return image.Point{X: x, Y: y}
}

// Resize functions - return image.Image
func (img *Image) Resize(pic image.Image, width uint, height uint, interp resize.InterpolationFunction) image.Image {
	return resize.Resize(width, height, pic, interp)
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

func (img *Image) Thumbnail(maxWidth, maxHeight uint, src image.Image, interp resize.InterpolationFunction) image.Image {
	return resize.Thumbnail(maxWidth, maxHeight, src, interp)
}

// Color creation functions
func (img *Image) RGBA(r, g, b, a uint8) color.Color {
	return color.RGBA{R: r, G: g, B: b, A: a}
}

func (img *Image) RGBA64(r, g, b, a uint16) color.Color {
	return color.RGBA64{R: r, G: g, B: b, A: a}
}

func (img *Image) NRGBA(r, g, b, a uint8) color.Color {
	return color.NRGBA{R: r, G: g, B: b, A: a}
}

func (img *Image) NRGBA64(r, g, b, a uint16) color.Color {
	return color.NRGBA64{R: r, G: g, B: b, A: a}
}

func (img *Image) Alpha(a uint8) color.Color {
	return color.Alpha{A: a}
}

func (img *Image) Alpha16(a uint16) color.Color {
	return color.Alpha16{A: a}
}

func (img *Image) Gray(y uint8) color.Color {
	return color.Gray{Y: y}
}

func (img *Image) Gray16(y uint16) color.Color {
	return color.Gray16{Y: y}
}

// Encoding functions
func (img *Image) EncodePNG(filename string, src image.Image) {
	file, err := os.Create(filename)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to create file %s: %v", filename, err))
		return
	}
	defer file.Close()

	err = png.Encode(file, src)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to encode PNG: %v", err))
	}
}

func (img *Image) EncodeJPEG(filename string, src image.Image, quality int) {
	file, err := os.Create(filename)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to create file %s: %v", filename, err))
		return
	}
	defer file.Close()

	options := &jpeg.Options{Quality: quality}
	err = jpeg.Encode(file, src, options)
	if err != nil {
		img.node.HandleError(fmt.Errorf("failed to encode JPEG: %v", err))
	}
}

func (img *Image) NewBoundingBox(x1, y1, x2, y2 float32, confidence float32) BoundingBox {
	return BoundingBox{
		X1:         x1,
		Y1:         y1,
		X2:         x2,
		Y2:         y2,
		Confidence: confidence,
		Label:      "unknown",
	}
}

func (img *Image) GetYoloClass(index int) string {
	if index < 0 || index >= len(YoloClasses) {
		return "unknown"
	}
	return YoloClasses[index]
}

func (img *Image) Draw(dst draw.Image, r image.Rectangle, src image.Image, sp image.Point, op draw.Op) {
	draw.Draw(dst, r, src, sp, op)
}

func (img *Image) DrawBoundingBoxes(pic image.Image, boxes []BoundingBox, fontSize float64, fillOpacity int) image.Image {
	// Copia RGBA de la imagen original
	bounds := pic.Bounds()
	out := image.NewRGBA(bounds)
	draw.Draw(out, bounds, pic, bounds.Min, draw.Src)

	// Color por clase (rotando sobre 'colors')
	boxClassColors := make(map[string]color.RGBA, len(boxes))
	for i, box := range boxes {
		if _, ok := boxClassColors[box.Label]; !ok {
			boxClassColors[box.Label] = colors[i%len(colors)]
		}
	}

	// helpers locales
	min := func(a, b int) int {
		if a < b {
			return a
		}
		return b
	}
	max := func(a, b int) int {
		if a > b {
			return a
		}
		return b
	}

	for _, b := range boxes {
		col := boxClassColors[b.Label]
		r := b.ToRect().Intersect(out.Bounds())
		if r.Empty() {
			continue
		}

		// ===== RELLENO: mismo color que el borde, poca opacidad (ajusta fillAlpha) =====
		fillAlpha := uint8(fillOpacity)
		fill := color.NRGBA{R: col.R, G: col.G, B: col.B, A: fillAlpha}
		draw.Draw(out, r, &image.Uniform{fill}, image.Point{}, draw.Over)

		// ===== BORDE: 4 rectángulos (sin bucles por píxel) =====
		t := 3 // grosor
		// top
		draw.Draw(out, image.Rect(r.Min.X, r.Min.Y, r.Max.X, min(r.Min.Y+t, r.Max.Y)),
			&image.Uniform{col}, image.Point{}, draw.Src)
		// bottom
		draw.Draw(out, image.Rect(r.Min.X, max(r.Max.Y-t, r.Min.Y), r.Max.X, r.Max.Y),
			&image.Uniform{col}, image.Point{}, draw.Src)
		// left
		draw.Draw(out, image.Rect(r.Min.X, r.Min.Y, min(r.Min.X+t, r.Max.X), r.Max.Y),
			&image.Uniform{col}, image.Point{}, draw.Src)
		// right
		draw.Draw(out, image.Rect(max(r.Max.X-t, r.Min.X), r.Min.Y, r.Max.X, r.Max.Y),
			&image.Uniform{col}, image.Point{}, draw.Src)

		// ===== ETIQUETA: fondo semitransparente + texto en blanco =====
		label := fmt.Sprintf("%s %.2f", b.Label, b.Confidence)
		padX, padY := 8, 6
		// Aproximación de ancho/alto (coherente con tu código actual)
		textW := int(float64(len(label)) * fontSize * 0.6)
		textH := int(fontSize)

		bg := image.Rect(r.Min.X, r.Min.Y-textH-2*padY, r.Min.X+textW+2*padX, r.Min.Y)
		if bg.Min.Y < bounds.Min.Y {
			// Si no cabe arriba, lo ponemos debajo
			bg = image.Rect(r.Min.X, r.Max.Y, r.Min.X+textW+2*padX, min(r.Max.Y+textH+2*padY, bounds.Max.Y))
		}

		// Fondo del rótulo: mismo color, más opacidad para contraste
		labelBg := color.NRGBA{R: col.R, G: col.G, B: col.B, A: 160}
		draw.Draw(out, bg, &image.Uniform{labelBg}, image.Point{}, draw.Over)

		// Baseline del texto dentro de la banda
		textX := bg.Min.X + padX
		textY := bg.Min.Y + padY + int(fontSize) - 2

		if err := img.drawLargeText(out, textX, textY, label, color.RGBA{255, 255, 255, 255}, fontSize); err != nil {
			img.node.HandleError(fmt.Errorf("error drawing text: %w", err))
			return nil
		}
	}

	return out
}

// DrawLargeText draws text using FreeType with configurable size
func (img *Image) drawLargeText(dst *image.RGBA, x, y int, text string, fg color.RGBA, fontSize float64) error {
	face, err := faceAt(fontSize)
	if err != nil {
		return err
	}
	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(fg),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(text)
	return nil
}

func (img *Image) YoloPreprocess(pic image.Image) []float32 {
	channelSize := 640 * 640
	data := make([]float32, channelSize*3)
	redChannel := data[0:channelSize]
	greenChannel := data[channelSize : channelSize*2]
	blueChannel := data[channelSize*2 : channelSize*3]

	// Resize the image to 640x640 using Lanczos3 algorithm
	pic = resize.Resize(640, 640, pic, resize.Lanczos3)
	i := 0
	for y := 0; y < 640; y++ {
		for x := 0; x < 640; x++ {
			r, g, b, _ := pic.At(x, y).RGBA()
			redChannel[i] = float32(r>>8) / 255.0
			greenChannel[i] = float32(g>>8) / 255.0
			blueChannel[i] = float32(b>>8) / 255.0
			i++
		}
	}

	return data
}

func (img *Image) YoloPostprocess(output []float32, originalWidth, originalHeight int) []BoundingBox {
	boundingBoxes := make([]BoundingBox, 0, 8400)

	var classID int
	var probability float32

	// Iterate through the output array, considering 8400 indices
	for idx := range 8400 {
		// Iterate through 80 classes and find the class with the highest probability
		probability = -1e9
		for col := range 80 {
			currentProb := output[8400*(col+4)+idx]
			if currentProb > probability {
				probability = currentProb
				classID = col
			}
		}

		// If the probability is less than 0.5, continue to the next index
		if probability < 0.5 {
			continue
		}

		// Extract the coordinates and dimensions of the bounding box
		xc, yc := output[idx], output[8400+idx]
		w, h := output[2*8400+idx], output[3*8400+idx]
		x1 := (xc - w/2) / 640 * float32(originalWidth)
		y1 := (yc - h/2) / 640 * float32(originalHeight)
		x2 := (xc + w/2) / 640 * float32(originalWidth)
		y2 := (yc + h/2) / 640 * float32(originalHeight)

		// Append the bounding box to the result
		boundingBoxes = append(boundingBoxes, BoundingBox{
			Label:      img.GetYoloClass(classID),
			Confidence: probability,
			X1:         x1,
			Y1:         y1,
			X2:         x2,
			Y2:         y2,
		})
	}

	// Sort the bounding boxes by probability
	sort.Slice(boundingBoxes, func(i, j int) bool {
		return boundingBoxes[i].Confidence < boundingBoxes[j].Confidence
	})

	// Define a slice to hold the final result
	mergedResults := make([]BoundingBox, 0, len(boundingBoxes))

	// Iterate through sorted bounding boxes, removing overlaps
	for _, candidateBox := range boundingBoxes {
		overlapsExistingBox := false
		for _, existingBox := range mergedResults {
			if (&candidateBox).Iou(&existingBox) > 0.7 {
				overlapsExistingBox = true
				break
			}
		}
		if !overlapsExistingBox {
			mergedResults = append(mergedResults, candidateBox)
		}
	}

	// This will still be in sorted order by confidence
	return mergedResults
}

var colors = []color.RGBA{
	// Colores básicos primarios y secundarios
	{255, 0, 0, 255},   // Red
	{0, 255, 0, 255},   // Green
	{0, 0, 255, 255},   // Blue
	{255, 0, 255, 255}, // Magenta
	{0, 255, 255, 255}, // Cyan
	{255, 128, 0, 255}, // Orange
	{128, 0, 255, 255}, // Purple
	{0, 128, 255, 255}, // Sky Blue

	// Tonos rojos y rosados
	{220, 20, 60, 255},   // Crimson
	{255, 20, 147, 255},  // Deep Pink
	{255, 69, 0, 255},    // Red Orange
	{178, 34, 34, 255},   // Fire Brick
	{255, 105, 180, 255}, // Hot Pink
	{139, 0, 0, 255},     // Dark Red
	{205, 92, 92, 255},   // Indian Red
	{240, 128, 128, 255}, // Light Coral

	// Tonos verdes
	{34, 139, 34, 255},   // Forest Green
	{0, 128, 0, 255},     // Green
	{50, 205, 50, 255},   // Lime Green
	{144, 238, 144, 255}, // Light Green
	{0, 100, 0, 255},     // Dark Green
	{127, 255, 212, 255}, // Aquamarine
	{0, 255, 127, 255},   // Spring Green
	{46, 125, 50, 255},   // Dark Forest Green

	// Tonos azules
	{30, 144, 255, 255},  // Dodger Blue
	{70, 130, 180, 255},  // Steel Blue
	{0, 0, 139, 255},     // Dark Blue
	{65, 105, 225, 255},  // Royal Blue
	{135, 206, 235, 255}, // Sky Blue Light
	{25, 25, 112, 255},   // Midnight Blue
	{72, 61, 139, 255},   // Dark Slate Blue
	{106, 90, 205, 255},  // Slate Blue

	// Tonos oscuros y contrastantes (sin amarillos claros)
	{204, 102, 0, 255}, // Dark Orange
	{153, 76, 0, 255},  // Burnt Orange
	{139, 69, 0, 255},  // Chocolate Brown
	{160, 82, 45, 255}, // Sienna Dark
	{128, 64, 0, 255},  // Dark Brown
	{102, 51, 0, 255},  // Very Dark Brown
	{176, 48, 96, 255}, // Maroon
	{128, 0, 32, 255},  // Dark Burgundy

	// Tonos violetas y morados
	{138, 43, 226, 255},  // Blue Violet
	{148, 0, 211, 255},   // Dark Violet
	{153, 50, 204, 255},  // Dark Orchid
	{186, 85, 211, 255},  // Medium Orchid
	{147, 112, 219, 255}, // Medium Purple
	{102, 51, 153, 255},  // Rebecca Purple
	{75, 0, 130, 255},    // Indigo
	{72, 61, 139, 255},   // Dark Slate Blue

	// Tonos tierra y marrones oscuros
	{139, 69, 19, 255},   // Saddle Brown
	{160, 82, 45, 255},   // Sienna
	{101, 67, 33, 255},   // Dark Brown
	{92, 51, 23, 255},    // Dark Chocolate
	{139, 90, 43, 255},   // Peru Dark
	{165, 42, 42, 255},   // Brown
	{218, 112, 214, 255}, // Orchid
	{128, 70, 27, 255},   // Saddle Brown Dark

	// Tonos cálidos intensos
	{255, 99, 71, 255},   // Tomato
	{255, 127, 80, 255},  // Coral
	{233, 150, 122, 255}, // Dark Salmon
	{250, 128, 114, 255}, // Salmon
	{255, 160, 122, 255}, // Light Salmon
	{255, 182, 193, 255}, // Light Pink
	{219, 112, 147, 255}, // Pale Violet Red
	{199, 21, 133, 255},  // Medium Violet Red

	// Tonos fríos intensos
	{0, 206, 209, 255},   // Dark Turquoise
	{64, 224, 208, 255},  // Turquoise
	{72, 209, 204, 255},  // Medium Turquoise
	{175, 238, 238, 255}, // Pale Turquoise
	{102, 205, 170, 255}, // Medium Aquamarine
	{0, 139, 139, 255},   // Dark Cyan
	{47, 79, 79, 255},    // Dark Slate Gray
	{95, 158, 160, 255},  // Cadet Blue

	// Colores distintivos adicionales (oscuros)
	{128, 0, 128, 255},  // Purple
	{75, 0, 130, 255},   // Indigo
	{72, 61, 139, 255},  // Dark Slate Blue
	{25, 25, 112, 255},  // Midnight Blue
	{139, 0, 139, 255},  // Dark Magenta
	{85, 26, 139, 255},  // Purple4
	{104, 34, 139, 255}, // Dark Orchid4
	{54, 69, 79, 255},   // Dark Slate Gray

	// Tonos oscuros contrastantes
	{105, 105, 105, 255}, // Dim Gray
	{169, 169, 169, 255}, // Dark Gray
	{128, 128, 128, 255}, // Gray
	{192, 192, 192, 255}, // Silver
	{119, 136, 153, 255}, // Light Slate Gray
	{112, 128, 144, 255}, // Slate Gray
	{47, 79, 79, 255},    // Dark Slate Gray
	{25, 25, 25, 255},    // Almost Black
}
