package utils

import (
	"bytes"
	"strings"
	"testing"
)

func TestEmailWithImages(t *testing.T) {
	m := newEmail("a@x.org", "b@x.org", "Informe", "Hola & adiós", []EmailImage{
		{FileName: "chart_1.png", Title: "Temperatura <max>", Data: []byte("PNGDATA1")},
		{FileName: "chart_2.png", Title: "", Data: []byte("PNGDATA2")},
	})
	var buf bytes.Buffer
	if _, err := m.WriteTo(&buf); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, want := range []string{
		"multipart/related",
		"Content-ID: <chart_1.png>",
		"Content-ID: <chart_2.png>",
		"Content-Type: image/png",
		"cid:chart_1.png",
		"Temperatura &lt;max&gt;",
		"Hola &amp; adi",
	} {
		if !strings.Contains(out, want) && !strings.Contains(strings.ReplaceAll(out, "=\r\n", ""), want) {
			t.Errorf("missing %q", want)
		}
	}
	plain := newEmail("a@x.org", "b@x.org", "S", "texto", nil)
	buf.Reset()
	plain.WriteTo(&buf)
	if strings.Contains(buf.String(), "multipart/related") || strings.Contains(buf.String(), "figure\">") {
		t.Error("an email without images has images")
	}
}
