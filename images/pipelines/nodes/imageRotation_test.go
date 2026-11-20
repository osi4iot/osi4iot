package nodes

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// a 40×20 image: red on its left half, blue on its right half
func sideImage(t *testing.T) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 40; x++ {
			c := color.RGBA{255, 0, 0, 255}
			if x >= 20 {
				c = color.RGBA{0, 0, 255, 255}
			}
			img.Set(x, y, c)
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func redAt(t *testing.T, data []byte, x, y int) bool {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	r, _, b, _ := img.At(x, y).RGBA()
	return r > b
}

func TestRotateImage(t *testing.T) {
	data := sideImage(t)
	for _, c := range []struct {
		deg        int
		w, h       int
		redX, redY int // where the red half is now
	}{
		{90, 20, 40, 10, 5},   // the left side to the top
		{180, 40, 20, 35, 10}, // the left side to the right
		{270, 20, 40, 10, 35}, // the left side to the bottom
	} {
		out, err := rotateImage(data, c.deg)
		if err != nil {
			t.Fatal(err)
		}
		cfg, _, _ := image.DecodeConfig(bytes.NewReader(out))
		if cfg.Width != c.w || cfg.Height != c.h || !redAt(t, out, c.redX, c.redY) {
			t.Errorf("%d°: %dx%d, red at (%d,%d): %v", c.deg, cfg.Width, cfg.Height, c.redX, c.redY, redAt(t, out, c.redX, c.redY))
		}
	}
	if _, err := rotateImage(data, 45); err == nil {
		t.Error("45° accepted")
	}
	for v, want := range map[any]int{float64(90): 90, "270": 270, "180°": 180, float64(-90): 270, float64(0): 0, float64(45): 0, "x": 0, nil: 0} {
		if got := rotationOf(v); got != want {
			t.Errorf("rotationOf(%v) = %d, want %d", v, got, want)
		}
	}
}

// the image model says the photo is sideways: it is turned and read again
func TestReadTurnsSidewaysImages(t *testing.T) {
	var sizes []string
	answers := []string{
		`{"rotation":90,"latex":"x+1=2 (badly read)"}`,
		`{"rotation":0,"latex":"\\begin{bmatrix} 2 & 1 \\\\ 1 & -1 \\end{bmatrix}"}`,
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		json.Unmarshal(body, &req)
		var parts []struct {
			ImageURL struct {
				URL string `json:"url"`
			} `json:"image_url"`
		}
		json.Unmarshal(req.Messages[1].Content, &parts)
		raw, _ := base64.StdEncoding.DecodeString(strings.SplitN(parts[1].ImageURL.URL, ",", 2)[1])
		cfg, _, _ := image.DecodeConfig(bytes.NewReader(raw))
		sizes = append(sizes, strings.Join([]string{itoa(cfg.Width), itoa(cfg.Height)}, "x"))
		answer := answers[min(len(sizes)-1, len(answers)-1)]
		json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]string{"content": answer}}}})
	}))
	defer srv.Close()
	r := &imageReader{ProviderURL: srv.URL, Model: "gpt-5-mini", ProviderType: "openai"}
	reading, err := r.Read(context.Background(), sideImage(t), "image/jpeg", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(sizes, ",") != "40x20,20x40" || reading.turned != 90 || !strings.Contains(reading.Latex, "bmatrix") {
		t.Errorf("sizes %v, turned %d, latex %q", sizes, reading.turned, reading.Latex)
	}

	// turned, the model still sees it sideways: it was wrong, the first reading stays
	sizes = nil
	answers = []string{`{"rotation":270,"latex":"first"}`, `{"rotation":90,"latex":"second"}`}
	reading, _ = r.Read(context.Background(), sideImage(t), "image/jpeg", "")
	if reading.Latex != "first" || reading.turned != 0 || len(sizes) != 2 {
		t.Errorf("wrong rotation: %q turned %d calls %d", reading.Latex, reading.turned, len(sizes))
	}

	// upright: one call
	sizes = nil
	answers = []string{`{"rotation":0,"latex":"y=3"}`}
	reading, _ = r.Read(context.Background(), sideImage(t), "image/jpeg", "")
	if reading.Latex != "y=3" || len(sizes) != 1 {
		t.Errorf("upright: %q calls %d", reading.Latex, len(sizes))
	}
}

func itoa(n int) string { return strconv.Itoa(n) }
