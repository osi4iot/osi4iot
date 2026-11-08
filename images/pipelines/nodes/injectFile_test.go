package nodes

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
)

func TestInjectedMessageJSON(t *testing.T) {
	msg := &nats.Msg{Subject: "inject.x", Data: []byte(`{"a": 1}`), Header: nats.Header{}}
	msg.Header.Set("Content-Type", "application/json")
	m, err := injectedMessage(msg)
	if err != nil || m.GetPayload()["a"] != 1.0 || m.HasFile() {
		t.Fatal(m, err)
	}
	if _, err := injectedMessage(&nats.Msg{Data: []byte("not json")}); err == nil {
		t.Fatal("bad JSON accepted")
	}
}

// A video frame as the browser sends it from an Inject node with a file:
// image/jpeg, the frame's time in X-Capture-Ts and Payload-* fields.
func TestInjectedMessageVideoFrame(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 32, 18))
	img.Set(3, 4, color.RGBA{255, 0, 0, 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	msg := &nats.Msg{Subject: "inject.x", Data: buf.Bytes(), Header: nats.Header{}}
	msg.Header.Set("Content-Type", "image/jpeg")
	msg.Header.Set("Inject-Node", "n1")
	msg.Header.Set("X-Capture-Ts", "1700000000100")
	msg.Header.Set("Payload-FileName", "video.mp4")
	msg.Header.Set("Payload-Frame", "12")
	m, err := injectedMessage(msg)
	if err != nil {
		t.Fatal(err)
	}
	if !m.IsImage() || m.GetFile().Name != "video.mp4" {
		t.Fatalf("file %+v", m.GetFile())
	}
	got, err := m.GetImage()
	if err != nil || got.Bounds().Dx() != 32 {
		t.Fatal(got, err)
	}
	p := m.GetPayload()
	if p["fileName"] != "video.mp4" || p["frame"] != "12" {
		t.Fatalf("payload %v", p)
	}
	if p["timestamp"] != time.UnixMilli(1700000000100).UTC().Format(time.RFC3339Nano) {
		t.Fatalf("timestamp %v", p["timestamp"])
	}
}

func TestInjectedMessageAudio(t *testing.T) {
	msg := &nats.Msg{Subject: "inject.x", Data: []byte("RIFF....WAVE"), Header: nats.Header{}}
	msg.Header.Set("Content-Type", "audio/wav")
	m, err := injectedMessage(msg)
	if err != nil || !m.IsAudio() || m.GetPayload()["timestamp"] == nil {
		t.Fatal(m, err)
	}
	empty := &nats.Msg{Subject: "inject.x", Header: nats.Header{}}
	empty.Header.Set("Content-Type", "image/png")
	if _, err := injectedMessage(empty); err == nil {
		t.Fatal("empty file accepted")
	}
}
