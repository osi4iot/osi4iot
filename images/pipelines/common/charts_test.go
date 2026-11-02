package common

import (
	"encoding/base64"
	"testing"
)

func TestChartsFromPayload(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G'}
	direct := ChartsFromPayload(map[string]any{"charts": []ChatChart{{ID: "chart_a", Title: "A", MimeType: "image/png", Data: png}, {ID: "empty"}}})
	if len(direct) != 1 || direct[0].ID != "chart_a" {
		t.Fatalf("direct: %+v", direct)
	}
	// as a Function node may give them back
	mixed := ChartsFromPayload(map[string]any{"charts": []any{
		map[string]any{"ID": "chart_b", "Title": "B", "Data": png},
		map[string]any{"id": "chart_c", "title": "C", "mimeType": "image/jpeg", "data": base64.StdEncoding.EncodeToString(png)},
		map[string]any{"id": "chart_d", "data": []any{float64(1), float64(2)}},
		map[string]any{"id": "bad", "data": "%%%"},
		map[string]any{"id": "bad2", "data": []any{float64(300)}},
		"nonsense",
	}})
	if len(mixed) != 3 {
		t.Fatalf("mixed: %+v", mixed)
	}
	if mixed[0].MimeType != "image/png" || mixed[1].MimeType != "image/jpeg" || string(mixed[2].Data) != "\x01\x02" {
		t.Errorf("mixed: %+v", mixed)
	}
	if ChartsFromPayload(nil) != nil || ChartsFromPayload(map[string]any{"charts": "x"}) != nil {
		t.Error("no charts expected")
	}
}

func TestChartFileName(t *testing.T) {
	for _, c := range []struct {
		chart ChatChart
		i     int
		want  string
	}{
		{ChatChart{ID: "chart_0123abcd", MimeType: "image/png"}, 0, "chart_0123abcd.png"},
		{ChatChart{ID: "../etc/passwd"}, 1, "chart_2.png"},
		{ChatChart{ID: "a b", MimeType: "image/jpeg"}, 0, "chart_1.jpg"},
		{ChatChart{}, 2, "chart_3.png"},
	} {
		if got := ChartFileName(c.chart, c.i); got != c.want {
			t.Errorf("%+v: %q, want %q", c.chart, got, c.want)
		}
	}
}
