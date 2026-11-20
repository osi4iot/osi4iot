package agentdata

import (
	"strings"
	"testing"

	"pipelines/common"
)

func TestNestedFields(t *testing.T) {
	s := &common.Sensor{Measurements: map[string]any{
		"battery.voltage": map[string]any{"type": "number", "label": "Bat", "units": "V"},
		"v":               map[string]any{"type": "number", "label": "DC", "path": "/power/dc/voltage"},
		"sensors.*.t":     map[string]any{"type": "array", "label": "N,S", "units": "°C"},
		"acc":             map[string]any{"type": "array", "label": "Ax,Ay"},
		"door":            map[string]any{"type": "boolean", "label": "Door"},
		"mode":            map[string]any{"type": "string", "label": "Mode"},
	}}
	var got []string
	for _, f := range sensorFields(s) {
		got = append(got, f.Name+"="+strings.Join(f.Path, "/"))
	}
	want := "acc[0]=acc/0 acc[1]=acc/1 battery.voltage=battery/voltage door=door sensors.*.t[0]=sensors/0/t sensors.*.t[1]=sensors/1/t v=power/dc/voltage"
	if strings.Join(got, " ") != want {
		t.Errorf("%v", got)
	}
	f, err := resolveField(SensorInfo{}, "battery.voltage")
	if err != nil || strings.Join(f.Path, "/") != "battery/voltage" {
		t.Errorf("%v %v", f, err)
	}
	f, _ = resolveField(SensorInfo{}, "vib[3]")
	if strings.Join(fieldPath(f), "/") != "vib/3" {
		t.Errorf("%v", f)
	}
	if strings.Join(fieldPath(Field{Key: "a", Index: 2}), "/") != "a/2" || !strings.Contains(fieldValueSQL(4), "'boolean'") {
		t.Error("old field")
	}
}
