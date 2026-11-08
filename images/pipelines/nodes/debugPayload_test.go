package nodes

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestDebugPayloadSummarisesAModelInput(t *testing.T) {
	input := make([]float32, 3*640*640)
	for i := range input {
		input[i] = float32(i%256) / 255
	}
	payload := map[string]any{
		"mlmInput":  input,
		"mlmOutput": make([]float32, 300*39),
		"letterbox": map[string]any{"scale": 0.5, "padX": 0.0, "padY": 140.0},
		"frame":     []byte("jpeg bytes"),
		"timestamp": "2026-11-08T17:00:00Z",
		"nan":       math.NaN(),
	}
	out := debugPayload(payload)
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if len(b) > maxDebugBytes {
		t.Fatalf("debug log of %d bytes", len(b))
	}
	in := out["mlmInput"].(map[string]any)
	if in["length"] != len(input) || in["_type"] != "float32[1228800]" || in["max"] != 1.0 || in["min"] != 0.0 {
		t.Fatalf("summary: %v", in)
	}
	if len(in["first"].([]any)) != 8 {
		t.Fatalf("first values: %v", in["first"])
	}
	if out["letterbox"].(map[string]any)["padY"] != 140.0 || out["timestamp"] != "2026-11-08T17:00:00Z" {
		t.Fatalf("small values must stay: %v", out)
	}
	if out["frame"].(map[string]any)["length"] != 10 || out["nan"] != "NaN" {
		t.Fatalf("bytes or NaN: %v %v", out["frame"], out["nan"])
	}
}

func TestDebugPayloadKeepsSmallPayloadsAsTheyAre(t *testing.T) {
	payload := map[string]any{"detections": []any{map[string]any{"label": "Rotor", "keypoints": []any{1.0, 2.0}}}, "n": 3}
	got, _ := json.Marshal(debugPayload(payload))
	want, _ := json.Marshal(payload)
	if string(got) != string(want) {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestDebugPayloadCutsLongTextsAndGivesUpOnHugeOnes(t *testing.T) {
	out := debugPayload(map[string]any{"text": strings.Repeat("a", 10000)})
	if s := out["text"].(string); !strings.HasSuffix(s, "(10000 characters)") || len(s) > 4100 {
		t.Fatalf("text: %d", len(s))
	}
	many := map[string]any{}
	for i := 0; i < 5000; i++ {
		many[strings.Repeat("k", 60)+string(rune('a'+i%26))+strings.Repeat("x", i%50)+string(rune(i))] = strings.Repeat("v", 300)
	}
	out = debugPayload(many)
	if _, ok := out["_debug"]; !ok {
		b, _ := json.Marshal(out)
		if len(b) > maxDebugBytes {
			t.Fatalf("still %d bytes", len(b))
		}
	}
}
