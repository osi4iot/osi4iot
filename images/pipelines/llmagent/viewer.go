package llmagent

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
)

// The web chat sends with each question what its 3D viewer holds (field
// "viewer" of the message): the names of the collections of sensors,
// assets, animated, generic and FEM objects, and the FEM results. The
// viewer options take them by their exact name, so the model gets them
// with the question.

// viewerKinds are the lists of the "viewer" field, in the order they are
// told, with the uiOpts map their names are keys of.
var viewerKinds = []struct{ key, label, uiOpts string }{
	{"sensors", "sensor collections", "sensorsVisibilityState"},
	{"assets", "asset collections", "assetsVisibilityState"},
	{"animatedObjects", "animated objects", "animatedObjectsVisibilityState"},
	{"genericObjects", "generic object collections", "genericObjectsVisibilityState"},
	{"femSimulationObjects", "FEM object collections", "femSimulationObjectsVisibilityState"},
	{"femResults", "FEM results", "femSimulationResult"},
}

const (
	maxViewerNames   = 80
	maxViewerNameLen = 80
)

// ViewerContext is the context line for what the viewer holds ("" when
// the message says nothing of it). The names are quoted (JSON strings):
// they are data written by whoever made the 3D model.
func ViewerContext(viewer any) string {
	m, ok := viewer.(map[string]any)
	if !ok {
		return ""
	}
	var parts []string
	for _, k := range viewerKinds {
		names := viewerNames(m[k.key])
		if len(names) == 0 {
			continue
		}
		quoted := make([]string, len(names))
		for i, n := range names {
			b, _ := json.Marshal(n)
			quoted[i] = string(b)
		}
		parts = append(parts, k.label+" ("+k.uiOpts+"): "+strings.Join(quoted, ", "))
	}
	if sim := simulatorFields(m["simulator"]); sim != "" {
		parts = append(parts, "simulator inputs (digitalTwinSimulatorState; sending them locks the reading of the live measurements): "+sim)
	}
	if len(parts) == 0 {
		return ""
	}
	return "[Viewer: the 3D viewer next to the chat holds these, by their exact names. In uiOpts use these " +
		"names exactly as written, matching what the user says to them whatever its capitals. " +
		strings.Join(parts, "; ") + ".]\n\n"
}

// simulatorFields tells the inputs of the digital twin simulator: field,
// label, units, range and current value.
func simulatorFields(v any) string {
	list, ok := v.([]any)
	if !ok {
		return ""
	}
	var out []string
	for _, item := range list {
		f, ok := item.(map[string]any)
		if !ok {
			continue
		}
		field := viewerNames([]any{f["field"]})
		if len(field) == 0 {
			continue
		}
		name, _ := json.Marshal(field[0])
		desc := []string{}
		if label := viewerNames([]any{f["label"]}); len(label) == 1 {
			desc = append(desc, label[0])
		}
		if units := viewerNames([]any{f["units"]}); len(units) == 1 {
			desc = append(desc, units[0])
		}
		minV, okMin := f["min"].(float64)
		maxV, okMax := f["max"].(float64)
		if okMin && okMax {
			desc = append(desc, fmt.Sprintf("%g to %g", minV, maxV))
		}
		if now, ok := f["value"].(float64); ok {
			desc = append(desc, fmt.Sprintf("now %g", now))
		}
		entry := string(name)
		if len(desc) > 0 {
			entry += " (" + strings.Join(desc, ", ") + ")"
		}
		out = append(out, entry)
		if len(out) == maxViewerNames {
			break
		}
	}
	return strings.Join(out, ", ")
}

func viewerNames(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, item := range list {
		s, ok := item.(string)
		if !ok {
			continue
		}
		s = strings.Map(func(r rune) rune {
			if unicode.IsControl(r) {
				return -1
			}
			return r
		}, strings.TrimSpace(s))
		if s == "" {
			continue
		}
		if r := []rune(s); len(r) > maxViewerNameLen {
			s = string(r[:maxViewerNameLen])
		}
		out = append(out, s)
		if len(out) == maxViewerNames {
			break
		}
	}
	return out
}
