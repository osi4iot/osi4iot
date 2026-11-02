package llmagent

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestViewerContext(t *testing.T) {
	var payload map[string]any
	_ = json.Unmarshal([]byte(`{"viewer": {"sensors": ["Strain gauges", "Wind speed"], "genericObjects": ["Sea", "", "Tower\nbase"],
		"assets": [], "femResults": ["Disp_Z"], "other": ["x"],
		"simulator": [{"field": "windSpeed", "label": "Wind speed", "units": "m/sec", "min": 0, "max": 29, "value": 2},
			{"field": "windDirection", "label": "Wind direction", "units": "degrees", "min": 0, "max": 360, "value": null}]}}`), &payload)
	ctx := ViewerContext(payload["viewer"])
	for _, want := range []string{
		`sensor collections (sensorsVisibilityState): "Strain gauges", "Wind speed"`,
		`generic object collections (genericObjectsVisibilityState): "Sea", "Towerbase"`,
		`FEM results (femSimulationResult): "Disp_Z"`,
		`"windSpeed" (Wind speed, m/sec, 0 to 29, now 2), "windDirection" (Wind direction, degrees, 0 to 360)`,
		"exact names",
	} {
		if !strings.Contains(ctx, want) {
			t.Errorf("missing %q in %q", want, ctx)
		}
	}
	if strings.Contains(ctx, "asset collections") || strings.Contains(ctx, `"x"`) {
		t.Errorf("empty or unknown lists told: %q", ctx)
	}
	if !strings.HasSuffix(ctx, "]\n\n") {
		t.Errorf("context must end the line: %q", ctx)
	}
	for _, none := range []any{nil, "x", map[string]any{}, map[string]any{"sensors": []any{1, ""}}} {
		if got := ViewerContext(none); got != "" {
			t.Errorf("%v: %q", none, got)
		}
	}
}
