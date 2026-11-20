package agentdata

import (
	"net/http"
	"testing"
)

func TestTableChart(t *testing.T) {
	s, _ := newTestService(t, nil)
	f := func(v float64) *float64 { return &v }
	cases := map[string]map[string]any{
		"table_line_dates": {"kind": "line", "title": "Temperatura", "x_label": "Fecha", "y_label": "°C", "x_time": true,
			"x":      []float64{1767225600000, 1767312000000, 1767398400000, 1767484800000},
			"series": []map[string]any{{"name": "S1", "y": []*float64{f(20), f(21.5), nil, f(19)}}, {"name": "S2", "y": []*float64{f(18), f(18.5), f(19), f(20)}}}},
		"table_scatter": {"kind": "scatter", "x_label": "Carga (N)", "y_label": "Flecha (mm)",
			"x":      []float64{1, 2, 3, 4, 5},
			"series": []map[string]any{{"name": "flecha", "y": []*float64{f(0.1), f(0.21), f(0.29), f(0.42), f(0.5)}}}},
		"table_bars": {"kind": "bar", "y_label": "Media (°C)",
			"categories": []string{"S0", "S1", "S2"},
			"series":     []map[string]any{{"name": "media", "y": []*float64{f(21), f(-2), f(25)}}, {"name": "máximo", "y": []*float64{f(30), f(4), nil}}}},
	}
	for name, args := range cases {
		code, out := post(t, s, "table_chart", auth(s, args))
		if code != http.StatusOK {
			t.Fatalf("%s: %d %v", name, code, out)
		}
		takePNG(t, s, out, name)
	}

	bad := []map[string]any{
		{"kind": "pie", "x": []float64{1}, "series": []map[string]any{{"name": "a", "y": []float64{1}}}},
		{"kind": "line", "x": []float64{1, 2}, "series": []map[string]any{{"name": "a", "y": []float64{1}}}},
		{"kind": "bar", "categories": []string{}, "series": []map[string]any{{"name": "a", "y": []float64{}}}},
		{"kind": "line", "x": []float64{1}, "series": []map[string]any{}},
		{"kind": "line", "x": []float64{1}, "series": []map[string]any{{"name": "a", "y": []any{nil}}}},
	}
	for _, args := range bad {
		if code, out := post(t, s, "table_chart", auth(s, args)); code == http.StatusOK {
			t.Errorf("%v accepted: %v", args, out)
		}
	}
	// another digital twin's token
	body := auth(s, cases["table_scatter"])
	body["digital_twin_id"] = 71
	if code, _ := post(t, s, "table_chart", body); code != http.StatusForbidden {
		t.Errorf("token of another digital twin: %d", code)
	}
}
