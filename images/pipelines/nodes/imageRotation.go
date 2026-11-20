package nodes

// Images attached to the chat whose writing is sideways or upside down: a photo taken with the phone turned
// whose file does not say how to turn it (a phone with the rotation of the screen locked keeps the picture as the
// sensor took it). The image model says how many degrees the image must be turned (imageReading.Rotation); the
// image is turned here and read again, upright, which a small model reads much better.

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png" // a PNG attached from the computer
	"math"
	"strconv"
	"strings"
)

const (
	rotatedJPEGQuality = 90
	maxRotatedPixels   = 40_000_000
)

// rotationOf: the clockwise rotation the model asked for, 90, 180 or 270; 0 for anything else.
func rotationOf(v any) int {
	var deg float64
	switch x := v.(type) {
	case float64:
		deg = x
	case json.Number:
		deg, _ = x.Float64()
	case string:
		deg, _ = strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(x), "°")), 64)
	default:
		return 0
	}
	d := ((int(math.Round(deg)) % 360) + 360) % 360
	if d == 90 || d == 180 || d == 270 {
		return d
	}
	return 0
}

// rotateImage turns an image (JPEG or PNG) degrees clockwise (90, 180, 270) and gives it as a JPEG.
func rotateImage(data []byte, degrees int) ([]byte, error) {
	if degrees != 90 && degrees != 180 && degrees != 270 {
		return nil, errors.New("the rotation is 90, 180 or 270 degrees")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	if cfg.Width*cfg.Height > maxRotatedPixels {
		return nil, errors.New("the image is too large to turn")
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dw, dh := h, w
	if degrees == 180 {
		dw, dh = w, h
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for dy := 0; dy < dh; dy++ {
		for dx := 0; dx < dw; dx++ {
			var sx, sy int
			switch degrees {
			case 90: // the left side of the image goes to the top
				sx, sy = dy, h-1-dx
			case 180:
				sx, sy = w-1-dx, h-1-dy
			case 270: // the right side goes to the top
				sx, sy = w-1-dy, dx
			}
			dst.Set(dx, dy, src.At(b.Min.X+sx, b.Min.Y+sy))
		}
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: rotatedJPEGQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
