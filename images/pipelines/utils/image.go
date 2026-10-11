package utils

import (
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
)

func LoadImageFromFile(imagePath string) (image.Image, error) {
	f, err := os.Open(imagePath)
	if err != nil {
		return nil, fmt.Errorf("error opening %s: %w", imagePath, err)
	}
	defer f.Close()
	pic, _, err := image.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("error decoding %s: %w", imagePath, err)
	}
	return pic, nil
}

func SaveImageToFile(img image.Image, imagePath string, format string, quality int) error {
	f, err := os.Create(imagePath)
	if err != nil {
		return fmt.Errorf("error creating %s: %w", imagePath, err)
	}
	defer f.Close()

	switch format {
	case "jpeg", "jpg":
		if err := jpeg.Encode(f, img, &jpeg.Options{Quality: quality}); err != nil {
			return fmt.Errorf("error encoding %s: %w", imagePath, err)
		}
	case "png":
		if err := png.Encode(f, img); err != nil {
			return fmt.Errorf("error encoding %s: %w", imagePath, err)
		}
	default:
		return fmt.Errorf("unsupported format: %s. Use 'jpeg' or 'png'", format)
	}
	return nil
}
