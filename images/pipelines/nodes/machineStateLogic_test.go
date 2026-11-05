package nodes

import (
	"testing"
	"time"
)

func machineTestConfig(t *testing.T) *machineConfig {
	t.Helper()
	cfg, err := parseMachineConfig(map[string]any{
		"rules": []any{
			map[string]any{"state": "Fault", "property": "payload.fault", "operator": "true"},
			map[string]any{"state": "Running", "property": "payload.speed", "operator": "gt", "value": "0"},
		},
		"defaultState": "Stopped", "minDurationSeconds": 30,
	}, time.UTC)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func changedTo(out machineOutcome) []string {
	var states []string
	for _, c := range out.Changes {
		states = append(states, c["state"].(string))
	}
	return states
}

// A source that sends only on change: the fault held 25 min must count
// when the next message comes, even if no clock tick confirmed it.
func TestMachineStateCandidateConfirmedByTheNextMessage(t *testing.T) {
	cfg := machineTestConfig(t)
	t0 := time.Date(2026, 11, 4, 8, 0, 0, 0, time.UTC)
	out := cfg.observe(nil, "", "t", map[string]any{"speed": 120.0}, t0)
	st := out.Next
	out = cfg.observe(st, "", "t", map[string]any{"fault": true}, t0.Add(time.Hour))
	if len(out.Changes) != 0 {
		t.Fatalf("the fault must wait for the minimum duration: %v", changedTo(out))
	}
	st = out.Next
	out = cfg.observe(st, "", "t", map[string]any{"speed": 120.0}, t0.Add(85*time.Minute))
	got := changedTo(out)
	if len(got) != 1 || got[0] != "Fault" {
		t.Fatalf("changes %v, want [Fault]", got)
	}
	st = out.Next
	if st.State != "Fault" || st.Candidate != "Running" {
		t.Fatalf("state %s, candidate %s", st.State, st.Candidate)
	}
	if d := st.Durations["Fault"]; d != 25*60 {
		t.Fatalf("fault time %v s, want 1500", d)
	}
	if d := st.Durations["Running"]; d != 3600 {
		t.Fatalf("running time %v s, want 3600", d)
	}
}

func TestMachineStateCandidateConfirmedByTheClock(t *testing.T) {
	cfg := machineTestConfig(t)
	t0 := time.Date(2026, 11, 4, 8, 0, 0, 0, time.UTC)
	st := cfg.observe(nil, "", "t", map[string]any{"speed": 120.0}, t0).Next
	st = cfg.observe(st, "", "t", map[string]any{"speed": 0.0}, t0.Add(time.Minute)).Next
	if out := cfg.tick(st, "", t0.Add(80*time.Second)); len(out.Changes) != 0 {
		t.Fatalf("too soon: %v", changedTo(out))
	}
	out := cfg.tick(st, "", t0.Add(91*time.Second))
	if got := changedTo(out); len(got) != 1 || got[0] != "Stopped" {
		t.Fatalf("changes %v, want [Stopped]", got)
	}
	if out.Changes[0]["since"] != isoTime(t0.Add(time.Minute)) {
		t.Fatalf("the stop began when it was first seen: %v", out.Changes[0]["since"])
	}
	// a blip shorter than the minimum duration is not a state
	st = cfg.observe(out.Next, "", "t", map[string]any{"speed": 120.0}, t0.Add(2*time.Minute)).Next
	st = cfg.observe(st, "", "t", map[string]any{"speed": 0.0}, t0.Add(2*time.Minute+10*time.Second)).Next
	if out := cfg.observe(st, "", "t", map[string]any{"speed": 120.0}, t0.Add(2*time.Minute+20*time.Second)); len(out.Changes) != 0 {
		t.Fatalf("blip: %v", changedTo(out))
	}
}
