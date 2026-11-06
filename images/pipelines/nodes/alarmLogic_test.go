package nodes

import (
	"testing"
	"time"
)

func mustAlarmConfig(t *testing.T, settings map[string]any) *alarmConfig {
	t.Helper()
	cfg, err := parseAlarmConfig("Motor temperature", settings)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

// step applies a value (or, with value nil, the clock) at t0 + seconds and
// returns the event kinds.
type alarmRun struct {
	t     *testing.T
	cfg   *alarmConfig
	state *alarmState
	t0    time.Time
}

func (r *alarmRun) at(seconds float64) time.Time {
	return r.t0.Add(time.Duration(seconds * float64(time.Second)))
}

func kinds(res alarmStepResult) []string {
	var out []string
	for _, e := range res.Events {
		out = append(out, e["event"].(string))
	}
	return out
}

func (r *alarmRun) value(seconds float64, v any) []string {
	r.t.Helper()
	res, ok := r.cfg.evaluate(r.state, "", "dev2pdb.G.T", v, r.at(seconds))
	if !ok {
		r.t.Fatalf("value %v not used", v)
	}
	r.state = res.Next
	return kinds(res)
}

func (r *alarmRun) tick(seconds float64) []string {
	res := r.cfg.tick(r.state, "", r.at(seconds))
	if res.Next != nil {
		r.state = res.Next
	}
	return kinds(res)
}

func (r *alarmRun) ack(seconds float64, user string) []string {
	res := r.cfg.acknowledge(r.state, "", user, r.at(seconds))
	r.state = res.Next
	return kinds(res)
}

func expectEvents(t *testing.T, step string, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: events %v, want %v", step, got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: events %v, want %v", step, got, want)
		}
	}
}

// The example of the guide: high, Warning 70, Alarm 85, hysteresis 2, on
// delay 10 s, off delay 0.
func TestAlarmGuideExample(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{
		"property": "payload.temperature", "condition": "high", "warning": 70, "alarm": 85,
		"hysteresis": 2, "onDelaySeconds": 10, "units": "°C",
	})
	r := &alarmRun{t: t, cfg: cfg, t0: time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC)}

	expectEvents(t, "65", r.value(0, 65.0))
	expectEvents(t, "72 starts the delay", r.value(5, 72.0))
	expectEvents(t, "clock before the delay", r.tick(14))
	expectEvents(t, "clock after the delay", r.tick(15), "raised")
	if r.state.stateName(r.at(15)) != "active_unack" || r.state.Level != alarmWarning {
		t.Fatalf("after raised: %+v", r.state)
	}
	expectEvents(t, "86 starts the delay", r.value(20, 86.0))
	expectEvents(t, "escalation", r.tick(30), "escalated")
	expectEvents(t, "ack", r.ack(40, "ana"), "acknowledged")
	if r.state.stateName(r.at(40)) != "active_ack" {
		t.Fatalf("after ack: %s", r.state.stateName(r.at(40)))
	}
	expectEvents(t, "84 held by the hysteresis", r.value(50, 84.0))
	expectEvents(t, "82 de-escalates", r.value(55, 82.0), "deescalated")
	if !r.state.Acked {
		t.Fatal("de-escalation must keep the acknowledgement")
	}
	expectEvents(t, "69 held by the hysteresis", r.value(60, 69.0))
	res, _ := cfg.evaluate(r.state, "", "t", 67.0, r.at(65))
	expectEvents(t, "67 clears", kinds(res), "cleared")
	e := res.Events[0]
	if e["maxLevel"] != "Alarm" || e["durationSeconds"] != 50.0 {
		t.Fatalf("cleared event: %v", e)
	}
	if res.Next.stateName(r.at(65)) != "normal" {
		t.Fatalf("an acknowledged alarm goes back to normal, got %s", res.Next.stateName(r.at(65)))
	}
}

func TestAlarmEscalationNeedsANewAckAndUnackedClearStays(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "warning": 70, "alarm": 85})
	r := &alarmRun{t: t, cfg: cfg, t0: time.Now()}
	expectEvents(t, "raise", r.value(0, 75.0), "raised")
	r.ack(1, "ana")
	expectEvents(t, "escalate", r.value(2, 90.0), "escalated")
	if r.state.Acked {
		t.Fatal("escalation must remove the acknowledgement")
	}
	expectEvents(t, "clear", r.value(3, 10.0), "cleared")
	if r.state.stateName(r.at(3)) != "rtn_unack" {
		t.Fatalf("an unacknowledged alarm that clears stays rtn_unack, got %s", r.state.stateName(r.at(3)))
	}
	expectEvents(t, "late ack", r.ack(4, "ana"), "acknowledged")
	if r.state.stateName(r.at(4)) != "normal" {
		t.Fatalf("after the late ack: %s", r.state.stateName(r.at(4)))
	}
}

func TestAlarmDelayCancelledWhenTheValueComesBack(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "alarm": 85, "onDelaySeconds": 10})
	r := &alarmRun{t: t, cfg: cfg, t0: time.Now()}
	r.value(0, 90.0)
	r.value(5, 80.0) // back before the delay
	expectEvents(t, "no alarm", r.tick(12))
	if r.state.Level != alarmNone {
		t.Fatal("the delay must be cancelled")
	}
}

func TestAlarmViewerRequests(t *testing.T) {
	if _, all, _, _, err := parseAlarmViewerRequest([]byte(`{"action":"ack"}`)); err != nil || !all {
		t.Fatalf("ack without key: all=%v err=%v", all, err)
	}
	_, all, key, _, err := parseAlarmViewerRequest([]byte(`{"action":"ack","key":""}`))
	if err != nil || all || key != "" {
		t.Fatalf("ack of the key \"\" (the node without key path): all=%v key=%q err=%v", all, key, err)
	}
	_, _, key, d, err := parseAlarmViewerRequest([]byte(`{"action":"shelve","key":"S1","minutes":30}`))
	if err != nil || key != "S1" || d != 30*time.Minute {
		t.Fatalf("shelve: key=%q d=%v err=%v", key, d, err)
	}
	for _, bad := range []string{`{"action":"shelve"}`, `{"action":"shelve","minutes":-1}`, `{"action":"shelve","minutes":20000}`, `{"action":"x"}`, `not json`} {
		if _, _, _, _, err := parseAlarmViewerRequest([]byte(bad)); err == nil {
			t.Fatalf("%s must be rejected", bad)
		}
	}
}

func TestAlarmViewerSummaryAndOrder(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "warning": 70, "alarm": 85, "units": "°C", "keyPath": "payload.sensorId"})
	now := time.Now()
	if cfg.viewerSummary(&alarmState{}, "S0", now) != nil {
		t.Fatal("a normal alarm is not listed")
	}
	warnAcked := &alarmState{Level: alarmWarning, Acked: true, Value: 72.0, RaisedAt: now.UnixMilli(), MaxLevel: alarmWarning, AckBy: "ana", AckAt: now.UnixMilli()}
	alarmUnacked := &alarmState{Level: alarmAlarm, Value: 90.0, RaisedAt: now.UnixMilli(), MaxLevel: alarmAlarm}
	shelved := &alarmState{Level: alarmAlarm, Value: 99.0, ShelvedUntil: now.Add(time.Hour).UnixMilli()}
	rtn := &alarmState{RtnUnack: true, Value: 20.0, MaxLevel: alarmWarning}

	s := cfg.viewerSummary(alarmUnacked, "S2", now)
	if s["name"] != "Motor temperature (S2)" || s["level"] != "Alarm" || s["threshold"] != "85 °C" || s["value"] != "90 °C" || s["canAck"] != true {
		t.Fatalf("summary: %v", s)
	}
	if r := cfg.viewerSummary(rtn, "S4", now); r["state"] != "rtn_unack" || r["canAck"] != true {
		t.Fatalf("rtn_unack summary: %v", r)
	}
	list := []map[string]any{
		cfg.viewerSummary(shelved, "S3", now),
		cfg.viewerSummary(warnAcked, "S1", now),
		cfg.viewerSummary(rtn, "S4", now),
		cfg.viewerSummary(alarmUnacked, "S2", now),
	}
	sortViewerAlarms(list)
	var order []string
	for _, a := range list {
		order = append(order, a["key"].(string))
	}
	want := []string{"S2", "S4", "S1", "S3"}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("order %v, want %v", order, want)
		}
	}
	if list[3]["shelved"] != true || list[3]["shelvedUntil"] == nil {
		t.Fatalf("shelved summary: %v", list[3])
	}
}

// A latched alarm: back to normal, it stays (and keeps the asset status)
// until it is reset; active again before the reset, it is the same alarm.
func TestAlarmLatched(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "warning": 70, "alarm": 85, "units": "°C", "latched": true})
	r := &alarmRun{t: t, cfg: cfg, t0: time.Date(2026, 11, 6, 10, 0, 0, 0, time.UTC)}
	reset := func(seconds float64, user string) []string {
		res := cfg.rearm(r.state, "", user, r.at(seconds))
		r.state = res.Next
		return kinds(res)
	}

	expectEvents(t, "raise", r.value(0, 90.0), "raised")
	expectEvents(t, "reset while active does nothing", reset(1, "ana"))
	expectEvents(t, "ack", r.ack(5*60, "ana"), "acknowledged")

	res, _ := cfg.evaluate(r.state, "", "t", 60.0, r.at(20*60))
	expectEvents(t, "back to normal", kinds(res), "latched")
	r.state = res.Next
	if res.Events[0]["level"] != "Alarm" || r.state.stateName(r.at(20*60)) != "latched" {
		t.Fatalf("latched event: %v", res.Events[0])
	}
	if r.state.effectiveLevel(r.at(20*60)) != alarmAlarm {
		t.Fatal("a latched alarm keeps the asset status")
	}
	s := cfg.viewerSummary(r.state, "", r.at(20*60))
	if s["canReset"] != true || s["canAck"] != false || s["level"] != "Alarm" || s["active"] != false || s["acked"] != true {
		t.Fatalf("summary: %v", s)
	}

	// active again before the reset: the same alarm, still acknowledged
	expectEvents(t, "again", r.value(30*60, 88.0), "reactivated")
	if !r.state.Acked || r.state.RaisedAt != r.at(0).UnixMilli() {
		t.Fatalf("reactivated: %+v", r.state)
	}
	expectEvents(t, "normal again", r.value(35*60, 50.0), "latched")

	res = cfg.rearm(r.state, "", "luis", r.at(60*60))
	expectEvents(t, "reset", kinds(res), "reset")
	r.state = res.Next
	e := res.Events[0]
	if e["resetBy"] != "luis" || e["state"] != "normal" || e["durationSeconds"] != 3600.0 || e["maxLevel"] != "Alarm" {
		t.Fatalf("reset event: %v", e)
	}
	if cfg.viewerSummary(r.state, "", r.at(60*60)) != nil || r.state.effectiveLevel(r.at(60*60)) != alarmNone {
		t.Fatal("after the reset the alarm is normal")
	}
	// a new occurrence is a new alarm
	expectEvents(t, "new", r.value(61*60, 80.0), "raised")
}

func TestAlarmLatchedUnacknowledgedAndEscalation(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{"condition": "high", "warning": 70, "alarm": 85, "latched": true})
	r := &alarmRun{t: t, cfg: cfg, t0: time.Now()}
	r.value(0, 75.0)
	expectEvents(t, "normal", r.value(1, 10.0), "latched")
	s := cfg.viewerSummary(r.state, "", r.at(1))
	if s["canAck"] != true || s["canReset"] != true || s["level"] != "Warning" {
		t.Fatalf("unacknowledged latched: %v", s)
	}
	// reactivated above the level it reached: escalated, a new acknowledgement is needed
	r.ack(2, "ana")
	expectEvents(t, "escalate", r.value(3, 90.0), "escalated")
	if r.state.Acked {
		t.Fatal("an escalation removes the acknowledgement")
	}
	// the reset also acknowledges
	r.value(4, 10.0)
	res := cfg.rearm(r.state, "", "ana", r.at(5))
	if r.state = res.Next; r.state.stateName(r.at(5)) != "normal" {
		t.Fatalf("after reset: %s", r.state.stateName(r.at(5)))
	}
	if _, _, _, _, err := parseAlarmViewerRequest([]byte(`{"action":"reset","key":"S1"}`)); err != nil {
		t.Fatal(err)
	}
}