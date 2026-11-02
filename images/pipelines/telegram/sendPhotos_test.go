package telegram

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendMediaGroup(t *testing.T) {
	var media []inputMediaPhoto
	files := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/botTOKEN/sendMediaGroup") {
			t.Errorf("path %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatal(err)
		}
		if r.FormValue("chat_id") != "42" {
			t.Errorf("chat_id %q", r.FormValue("chat_id"))
		}
		json.Unmarshal([]byte(r.FormValue("media")), &media)
		for field, fh := range r.MultipartForm.File {
			files[field] = fh[0].Filename
		}
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	telegramAPI = srv.URL
	err := sendMediaGroup("TOKEN", 42, []PhotoUpload{
		{Data: []byte("a"), FileName: "chart_a.png", Caption: "A"},
		{Data: []byte("b"), FileName: "chart_b.png", Caption: strings.Repeat("x", 2000)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(media) != 2 || media[0].Media != "attach://photo0" || media[1].Media != "attach://photo1" || media[0].Caption != "A" {
		t.Fatalf("media %+v", media)
	}
	if n := len([]rune(media[1].Caption)); n != maxCaptionRunes {
		t.Errorf("caption of %d runes", n)
	}
	if files["photo0"] != "chart_a.png" || files["photo1"] != "chart_b.png" {
		t.Errorf("files %v", files)
	}
}
