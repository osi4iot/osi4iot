package nodes

import (
	"testing"
	"time"
)

// The Alarm node writes an alarm in the asset state when what is shown
// changes, not with each value.
func TestAlarmAssetEntryChangesOnlyWithItsState(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "warning": 70, "alarm": 85, "units": "°C"})
	n := &AlarmNode{cfg: cfg}
	r := &alarmRun{t: t, cfg: cfg, t0: time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)}

	if n.assetEntry(nil, "", r.at(0)) != nil {
		t.Fatal("no alarm, no entry")
	}
	r.value(0, 75.0) // raised: Warning
	raised := n.assetEntry(r.state, "", r.at(0))
	if raised["level"] != "Warning" || raised["state"] != "active_unack" || raised["threshold"] != "70 °C" {
		t.Fatalf("entry: %v", raised)
	}
	before := r.state
	r.value(1, 78.0) // only the value changes
	if !sameAssetEntry(n.assetEntry(before, "", r.at(1)), n.assetEntry(r.state, "", r.at(1))) {
		t.Fatal("a new value of an active alarm must not be written")
	}
	before = r.state
	r.ack(2, "ana")
	acked := n.assetEntry(r.state, "", r.at(2))
	if sameAssetEntry(n.assetEntry(before, "", r.at(2)), acked) || acked["ackBy"] != "ana" {
		t.Fatalf("the acknowledgement must be written: %v", acked)
	}
	r.value(3, 20.0) // cleared and acknowledged: normal
	if n.assetEntry(r.state, "", r.at(3)) != nil {
		t.Fatal("a normal alarm is removed from the asset state")
	}
}

func TestMachineAssetEntry(t *testing.T) {
	e := machineAssetEntry("Línea 2", "M1", map[string]any{
		"event": "change", "state": "Fault", "since": "2026-11-05T08:00:00Z", "at": "2026-11-05T08:00:30Z",
		"previousState": "Running", "previousDurationSeconds": 10500.0, "message": "Running → Fault (after 2 h 55 min)",
	})
	want := map[string]any{"name": "Línea 2 (M1)", "key": "M1", "state": "Fault", "since": "2026-11-05T08:00:00Z",
		"previousState": "Running", "message": "Running → Fault (after 2 h 55 min)"}
	if len(e) != len(want) {
		t.Fatalf("entry %v", e)
	}
	for k, v := range want {
		if e[k] != v {
			t.Fatalf("%s: %v, want %v", k, e[k], v)
		}
	}
	if first := machineAssetEntry("Línea 2", "", map[string]any{"state": "Stopped", "since": "x"}); first["name"] != "Línea 2" || first["previousState"] != nil {
		t.Fatalf("first state: %v", first)
	}
}

func TestProjectedSectionOfNodes(t *testing.T) {
	if s := projectedSectionOf(&AlarmNode{updateAsset: true}); s != "alarms" {
		t.Fatalf("alarm: %q", s)
	}
	if s := projectedSectionOf(&AlarmNode{}); s != "" {
		t.Fatalf("alarm without updateAssetStatus: %q", s)
	}
	if s := projectedSectionOf(&MachineStateNode{updateAsset: true}); s != "machines" {
		t.Fatalf("machine state: %q", s)
	}
	if s := projectedSectionOf(&DeadbandNode{}); s != "" {
		t.Fatalf("deadband: %q", s)
	}
}
