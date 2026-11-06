package nodes

// Alarm node logic (pure): one condition on a field with two levels
// (Warning and Alarm), hysteresis, activation and normalization delays,
// acknowledgement and shelving, in the spirit of ISA-18.2.
//
// States of an alarm (per partition key):
//   normal         no condition, nothing to acknowledge
//   active_unack   active (Warning or Alarm), not acknowledged
//   active_ack     active, acknowledged
//   rtn_unack      back to normal but not acknowledged yet
//   latched        (latched alarms) the value is back to normal but the
//                  alarm stays until a user resets it; it still counts for
//                  the asset status, with the level it reached
//   shelved        silenced for a while: its events are not sent and it
//                  does not count for the asset status

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	alarmNone    = 0
	alarmWarning = 1
	alarmAlarm   = 2
)

var alarmLevelNames = []string{"Normal", "Warning", "Alarm"}

type alarmConfig struct {
	Name        string
	Property    string
	Condition   string // "high", "low" or "equals"
	Warning     string // threshold or value ("" none)
	Alarm       string
	Hysteresis  float64
	OnDelay     time.Duration
	OffDelay    time.Duration
	KeyPath     string
	Units       string
	Description string
	Latched     bool    // back to normal only when a user resets it
	warn, alarm float64 // numeric thresholds (high, low)
}

// alarmState is the state of one alarm (one partition key).
type alarmState struct {
	Level        int    `json:"level"`
	Acked        bool   `json:"acked"`
	RtnUnack     bool   `json:"rtnUnack,omitempty"`
	RaisedAt     int64  `json:"raisedAt,omitempty"`
	MaxLevel     int    `json:"maxLevel,omitempty"`
	Pending      int    `json:"pending"`
	PendingSince int64  `json:"pendingSince,omitempty"`
	Value        any    `json:"value,omitempty"`
	ShelvedUntil int64  `json:"shelvedUntil,omitempty"`
	AckBy        string `json:"ackBy,omitempty"`
	AckAt        int64  `json:"ackAt,omitempty"`
	Topic        string `json:"topic,omitempty"`
	// Latched: the value is back to normal, waiting for a reset (Level is
	// alarmNone; LatchedLevel is the worst level reached).
	Latched      bool  `json:"latched,omitempty"`
	LatchedLevel int   `json:"latchedLevel,omitempty"`
	LatchedAt    int64 `json:"latchedAt,omitempty"`
}

func parseAlarmConfig(name string, settings map[string]any) (*alarmConfig, error) {
	cfg := &alarmConfig{
		Name:        strings.TrimSpace(name),
		Property:    settingString(settings, "property", "payload.value"),
		Condition:   settingString(settings, "condition", "high"),
		Warning:     strings.TrimSpace(valueText(settings["warning"])),
		Alarm:       strings.TrimSpace(valueText(settings["alarm"])),
		Hysteresis:  settingNumber(settings, "hysteresis", 0),
		OnDelay:     time.Duration(settingNumber(settings, "onDelaySeconds", 0) * float64(time.Second)),
		OffDelay:    time.Duration(settingNumber(settings, "offDelaySeconds", 0) * float64(time.Second)),
		KeyPath:     settingString(settings, "keyPath", ""),
		Units:       settingString(settings, "units", ""),
		Description: settingString(settings, "description", ""),
		Latched:     settingBool(settings, "latched", false),
	}
	if cfg.Name == "" {
		cfg.Name = "Alarm"
	}
	if cfg.Warning == "" && cfg.Alarm == "" {
		return nil, fmt.Errorf("set the Warning level, the Alarm level or both")
	}
	if cfg.Hysteresis < 0 || cfg.OnDelay < 0 || cfg.OffDelay < 0 {
		return nil, fmt.Errorf("hysteresis and delays cannot be negative")
	}
	switch cfg.Condition {
	case "high", "low":
		var ok bool
		if cfg.Warning != "" {
			if cfg.warn, ok = toNumber(cfg.Warning); !ok {
				return nil, fmt.Errorf("the Warning level %q is not a number", cfg.Warning)
			}
		}
		if cfg.Alarm != "" {
			if cfg.alarm, ok = toNumber(cfg.Alarm); !ok {
				return nil, fmt.Errorf("the Alarm level %q is not a number", cfg.Alarm)
			}
		}
		if cfg.Warning != "" && cfg.Alarm != "" {
			if cfg.Condition == "high" && cfg.alarm < cfg.warn {
				return nil, fmt.Errorf("for a high alarm, the Alarm level must be above the Warning level")
			}
			if cfg.Condition == "low" && cfg.alarm > cfg.warn {
				return nil, fmt.Errorf("for a low alarm, the Alarm level must be below the Warning level")
			}
		}
	case "equals":
	default:
		return nil, fmt.Errorf("condition must be high, low or equals")
	}
	return cfg, nil
}

// threshold of a level for high/low conditions.
func (c *alarmConfig) threshold(level int) (float64, bool) {
	switch level {
	case alarmWarning:
		return c.warn, c.Warning != ""
	case alarmAlarm:
		return c.alarm, c.Alarm != ""
	}
	return 0, false
}

// beyond says whether v reaches the threshold t (shifted by the hysteresis
// when holding a level that is already active).
func (c *alarmConfig) beyond(v, t float64, holding bool) bool {
	h := 0.0
	if holding {
		h = c.Hysteresis
	}
	if c.Condition == "low" {
		return v <= t+h
	}
	return v >= t-h
}

// target is the level the value asks for, given the active level (the
// hysteresis keeps an active level until the value is clearly back).
func (c *alarmConfig) target(value any, current int) (int, bool) {
	if c.Condition == "equals" {
		text := valueText(value)
		matches := func(want string) bool {
			if want == "" {
				return false
			}
			a, okA := toNumber(value)
			b, okB := toNumber(want)
			if okA && okB {
				return a == b
			}
			return strings.EqualFold(text, want)
		}
		switch {
		case matches(c.Alarm):
			return alarmAlarm, true
		case matches(c.Warning):
			return alarmWarning, true
		}
		return alarmNone, true
	}
	v, ok := toNumber(value)
	if !ok {
		return current, false
	}
	for _, level := range []int{alarmAlarm, alarmWarning} {
		if t, set := c.threshold(level); set && c.beyond(v, t, current >= level) {
			return level, true
		}
	}
	return alarmNone, true
}

// alarmStepResult is what a message, a command or the clock did to an alarm.
type alarmStepResult struct {
	Events []map[string]any
	Next   *alarmState
}

func (s *alarmState) shelved(now time.Time) bool {
	return s != nil && s.ShelvedUntil > now.UnixMilli()
}

func (s *alarmState) stateName(now time.Time) string {
	switch {
	case s == nil:
		return "normal"
	case s.shelved(now):
		return "shelved"
	case s.Level > alarmNone && s.Acked:
		return "active_ack"
	case s.Level > alarmNone:
		return "active_unack"
	case s.Latched:
		return "latched"
	case s.RtnUnack:
		return "rtn_unack"
	}
	return "normal"
}

// effectiveLevel is what the alarm counts for in the asset status.
func (s *alarmState) effectiveLevel(now time.Time) int {
	if s == nil || s.shelved(now) {
		return alarmNone
	}
	return s.shownLevel()
}

// shownLevel is the level of an alarm: the active one, or the one reached
// by a latched alarm waiting for a reset.
func (s *alarmState) shownLevel() int {
	if s == nil {
		return alarmNone
	}
	if s.Level == alarmNone && s.Latched {
		return s.LatchedLevel
	}
	return s.Level
}

// canAck: active and not acknowledged, latched and not acknowledged, or
// back to normal without an acknowledgement.
func (s *alarmState) canAck() bool {
	return s != nil && ((s.Level > alarmNone || s.Latched) && !s.Acked || s.RtnUnack)
}

// canReset: latched and the value already back to normal.
func (s *alarmState) canReset() bool {
	return s != nil && s.Latched && s.Level == alarmNone
}

func cloneAlarmState(s *alarmState) *alarmState {
	if s == nil {
		return &alarmState{}
	}
	c := *s
	return &c
}

// evaluate applies a value at time now.
func (c *alarmConfig) evaluate(state *alarmState, key, topic string, value any, now time.Time) (alarmStepResult, bool) {
	next := cloneAlarmState(state)
	target, ok := c.target(value, next.Level)
	if !ok {
		return alarmStepResult{Next: state}, false
	}
	next.Value = cloneJSON(value)
	next.Topic = topic
	return c.advance(next, key, target, now), true
}

// tick lets the delays run out without a new message (the last value is
// taken as still valid) and ends expired shelving.
func (c *alarmConfig) tick(state *alarmState, key string, now time.Time) alarmStepResult {
	if state == nil {
		return alarmStepResult{}
	}
	next := cloneAlarmState(state)
	var events []map[string]any
	if state.ShelvedUntil > 0 && !state.shelved(now) {
		next.ShelvedUntil = 0
		events = append(events, c.event("unshelved", next, key, now, fmt.Sprintf("%s is no longer shelved", c.Name)))
	}
	if next.Pending != next.Level {
		r := c.advance(next, key, next.Pending, now)
		r.Events = append(events, r.Events...)
		return r
	}
	return alarmStepResult{Events: events, Next: next}
}

// advance moves towards the target level, once its delay has passed.
func (c *alarmConfig) advance(next *alarmState, key string, target int, now time.Time) alarmStepResult {
	t := now.UnixMilli()
	if target == next.Level {
		next.Pending, next.PendingSince = target, 0
		return alarmStepResult{Next: next}
	}
	if next.Pending != target || next.PendingSince == 0 {
		next.Pending, next.PendingSince = target, t
	}
	delay := c.OnDelay
	if target < next.Level {
		delay = c.OffDelay
	}
	if now.Sub(time.UnixMilli(next.PendingSince)) < delay {
		return alarmStepResult{Next: next}
	}
	from := next.Level
	next.Level = target
	next.Pending, next.PendingSince = target, 0
	var e map[string]any
	switch {
	case from == alarmNone && next.Latched:
		// active again while waiting for its reset: the same alarm
		next.Latched, next.LatchedAt = false, 0
		if target > next.MaxLevel {
			next.MaxLevel, next.Acked = target, false
			e = c.event("escalated", next, key, now, "")
		} else {
			e = c.event("reactivated", next, key, now, "")
		}
	case from == alarmNone:
		next.Acked, next.RtnUnack, next.RaisedAt, next.MaxLevel, next.AckBy, next.AckAt = false, false, t, target, "", 0
		e = c.event("raised", next, key, now, "")
	case target > from:
		next.Acked = false
		if target > next.MaxLevel {
			next.MaxLevel = target
		}
		e = c.event("escalated", next, key, now, "")
	case target > alarmNone:
		e = c.event("deescalated", next, key, now, "")
	case c.Latched:
		// back to normal, but it stays until a user resets it
		next.Latched, next.LatchedLevel, next.LatchedAt = true, next.MaxLevel, t
		e = c.event("latched", next, key, now, "")
	default:
		next.RtnUnack = !next.Acked
		e = c.event("cleared", next, key, now, "")
		e["durationSeconds"] = roundTo(now.Sub(time.UnixMilli(next.RaisedAt)).Seconds(), 1)
		e["maxLevel"] = alarmLevelNames[next.MaxLevel]
	}
	return alarmStepResult{Events: []map[string]any{e}, Next: next}
}

// acknowledge an alarm (by a user).
func (c *alarmConfig) acknowledge(state *alarmState, key, user string, now time.Time) alarmStepResult {
	if !state.canAck() {
		return alarmStepResult{Next: state}
	}
	next := cloneAlarmState(state)
	next.AckBy, next.AckAt = user, now.UnixMilli()
	if next.Level > alarmNone || next.Latched {
		next.Acked = true
	}
	next.RtnUnack = false
	return alarmStepResult{Events: []map[string]any{c.event("acknowledged", next, key, now, "")}, Next: next}
}

// rearm resets a latched alarm whose value is back to normal (it also
// acknowledges it): the alarm goes back to normal.
func (c *alarmConfig) rearm(state *alarmState, key, user string, now time.Time) alarmStepResult {
	if !state.canReset() {
		return alarmStepResult{Next: state}
	}
	next := cloneAlarmState(state)
	e := c.event("reset", next, key, now, "")
	if user != "" {
		e["resetBy"] = user
		e["message"] = e["message"].(string) + " by " + user
	}
	if next.RaisedAt > 0 {
		e["durationSeconds"] = roundTo(now.Sub(time.UnixMilli(next.RaisedAt)).Seconds(), 1)
	}
	e["maxLevel"] = alarmLevelNames[next.MaxLevel]
	next.Latched, next.LatchedLevel, next.LatchedAt = false, alarmNone, 0
	next.Acked, next.RtnUnack = false, false
	if next.AckBy == "" {
		next.AckBy, next.AckAt = user, now.UnixMilli()
	}
	e["state"] = next.stateName(now)
	return alarmStepResult{Events: []map[string]any{e}, Next: next}
}

// shelve silences an alarm for a while (0: unshelve).
func (c *alarmConfig) shelve(state *alarmState, key string, d time.Duration, user string, now time.Time) alarmStepResult {
	next := cloneAlarmState(state)
	if d <= 0 {
		if !next.shelved(now) {
			return alarmStepResult{Next: state}
		}
		next.ShelvedUntil = 0
		return alarmStepResult{Events: []map[string]any{c.event("unshelved", next, key, now, fmt.Sprintf("%s is no longer shelved", c.Name))}, Next: next}
	}
	next.ShelvedUntil = now.Add(d).UnixMilli()
	text := fmt.Sprintf("%s shelved for %s", c.Name, humanDuration(d))
	if user != "" {
		text += " by " + user
	}
	e := c.event("shelved", next, key, now, text)
	e["shelvedUntil"] = isoTime(time.UnixMilli(next.ShelvedUntil))
	return alarmStepResult{Events: []map[string]any{e}, Next: next}
}

// event builds an alarm event.
func (c *alarmConfig) event(kind string, s *alarmState, key string, now time.Time, text string) map[string]any {
	level := alarmLevelNames[s.shownLevel()]
	e := map[string]any{
		"event": kind,
		"alarm": c.Name,
		"level": level,
		"state": s.stateName(now),
		"value": s.Value,
		"at":    isoTime(now),
	}
	if key != "" {
		e["key"] = key
	}
	if s.RaisedAt > 0 {
		e["raisedAt"] = isoTime(time.UnixMilli(s.RaisedAt))
	}
	if s.AckBy != "" {
		e["ackBy"] = s.AckBy
	}
	if t, set := c.levelText(s.shownLevel()); set {
		e["threshold"] = t
	}
	if s.Latched {
		e["latchedAt"] = isoTime(time.UnixMilli(s.LatchedAt))
	}
	if c.Description != "" {
		e["description"] = c.Description
	}
	if text == "" {
		text = c.describe(kind, s, key)
	}
	e["message"] = text
	return e
}

func (c *alarmConfig) levelText(level int) (string, bool) {
	switch level {
	case alarmWarning:
		return c.Warning, c.Warning != ""
	case alarmAlarm:
		return c.Alarm, c.Alarm != ""
	}
	return "", false
}

// describe writes the human text of an event, for Email and Telegram.
func (c *alarmConfig) describe(kind string, s *alarmState, key string) string {
	who := c.Name
	if key != "" {
		who += " (" + key + ")"
	}
	value := c.valueText(s.Value)
	switch kind {
	case "raised", "escalated", "deescalated":
		prefix := map[string]string{"raised": "", "escalated": "Escalated to ", "deescalated": "Back to "}[kind]
		return fmt.Sprintf("%s%s: %s", prefix, strings.ToUpper(alarmLevelNames[s.Level]), who) + c.comparison(s.Level, value)
	case "cleared":
		return fmt.Sprintf("Cleared: %s, value %s", who, value)
	case "latched":
		return fmt.Sprintf("Back to normal, waiting for a reset: %s, value %s (reached %s)", who, value, strings.ToUpper(alarmLevelNames[s.LatchedLevel]))
	case "reactivated":
		return fmt.Sprintf("Active again, still waiting for a reset: %s", who) + c.comparison(s.Level, value)
	case "reset":
		return fmt.Sprintf("Reset: %s", who)
	case "acknowledged":
		text := fmt.Sprintf("Acknowledged: %s", who)
		if s.AckBy != "" {
			text += " by " + s.AckBy
		}
		return text
	}
	return fmt.Sprintf("%s: %s", kind, who)
}

func (c *alarmConfig) valueText(v any) string {
	text := valueText(v)
	if f, ok := v.(float64); ok {
		text = fmt.Sprintf("%.4g", f)
	}
	if c.Units != "" && text != "" {
		text += " " + c.Units
	}
	return text
}

func (c *alarmConfig) comparison(level int, value string) string {
	t, set := c.levelText(level)
	if !set {
		return ""
	}
	if c.Units != "" {
		t += " " + c.Units
	}
	switch c.Condition {
	case "high":
		return fmt.Sprintf(", %s ≥ %s", value, t)
	case "low":
		return fmt.Sprintf(", %s ≤ %s", value, t)
	}
	return fmt.Sprintf(", value %s", value)
}

// ---- asset status: the worst of the active alarms ----

// alarmRegistryEntry is one active alarm in an asset's registry.
type alarmRegistryEntry struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
}

// assetStatusOf is the asset status of a registry: OK, Warning or Alarm, with a
// description that lists the active alarms, worst first.
func assetStatusOf(registry map[string]alarmRegistryEntry) (string, string) {
	worst := alarmNone
	var alarms, warnings []string
	for _, e := range registry {
		if e.Level > worst {
			worst = e.Level
		}
		switch e.Level {
		case alarmAlarm:
			alarms = append(alarms, e.Text)
		case alarmWarning:
			warnings = append(warnings, e.Text)
		}
	}
	sortStrings(alarms)
	sortStrings(warnings)
	switch worst {
	case alarmAlarm:
		return "Alarm", strings.Join(append(alarms, warnings...), "; ")
	case alarmWarning:
		return "Warning", strings.Join(warnings, "; ")
	}
	return "OK", "No active alarms"
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// registryText is how an active alarm is described in the asset status. It
// depends on the level only (not on the latest value), so that the status
// is rewritten when an alarm changes, not with every reading.
func (c *alarmConfig) registryText(s *alarmState, key string) string {
	text := c.Name
	if key != "" {
		text += " (" + key + ")"
	}
	t, set := c.levelText(s.shownLevel())
	if !set {
		return text
	}
	if c.Units != "" {
		t += " " + c.Units
	}
	if s.Level == alarmNone && s.Latched {
		text += " (latched)"
	}
	switch c.Condition {
	case "high":
		return text + " ≥ " + t
	case "low":
		return text + " ≤ " + t
	}
	return text + " = " + t
}

// ---- the viewer's buttons ----

// The viewer acknowledges and shelves the alarms of a node with NATS
// requests on the user's own copy of the digital twin's "approval" topic
// (the one of the Approval nodes, which only the group's administrators can
// publish on), naming the node in this header.
const alarmNodeHeader = "Alarm-Node"

// alarmViewerRequest is a press of the viewer's alarm buttons.
type alarmViewerRequest struct {
	Action  string   `json:"action"`            // "list", "ack", "shelve" or "reset"
	Key     *string  `json:"key,omitempty"`     // one alarm; none: all of them
	Minutes *float64 `json:"minutes,omitempty"` // shelve: for how long (0: unshelve)
}

// parseAlarmViewerRequest checks a request of the viewer: the shelving time
// and whether it applies to all the alarms or to one key.
func parseAlarmViewerRequest(data []byte) (req alarmViewerRequest, all bool, key string, d time.Duration, err error) {
	if err = json.Unmarshal(data, &req); err != nil {
		return req, false, "", 0, fmt.Errorf("invalid request")
	}
	if req.Key == nil {
		all = true
	} else {
		key = *req.Key
	}
	switch req.Action {
	case "list", "ack", "reset":
	case "shelve":
		if req.Minutes == nil || *req.Minutes < 0 || *req.Minutes > alarmMaxShelveMinutes {
			return req, all, key, 0, fmt.Errorf("the shelving time must be between 0 and %d minutes", alarmMaxShelveMinutes)
		}
		d = time.Duration(*req.Minutes * float64(time.Minute))
	default:
		return req, all, key, 0, fmt.Errorf("unknown action")
	}
	return req, all, key, d, nil
}

// alarmMaxShelveMinutes: one week.
const alarmMaxShelveMinutes = 7 * 24 * 60

// viewerSummary describes an alarm for the viewer's list; nil when there is
// nothing to show (normal and not shelved).
func (c *alarmConfig) viewerSummary(s *alarmState, key string, now time.Time) map[string]any {
	state := s.stateName(now)
	if state == "normal" {
		return nil
	}
	who := c.Name
	if key != "" {
		who += " (" + key + ")"
	}
	out := map[string]any{
		"key":      key,
		"name":     who,
		"level":    alarmLevelNames[s.shownLevel()],
		"state":    state,
		"value":    c.valueText(s.Value),
		"canAck":   s.canAck(),
		"canReset": s.canReset(),
		"latched":  s.Latched,
		"active":   s.Level > alarmNone,
		"acked":    s.Acked,
		"shelved":  s.shelved(now),
		"maxLevel": alarmLevelNames[s.MaxLevel],
	}
	if s.Latched {
		out["latchedAt"] = isoTime(time.UnixMilli(s.LatchedAt))
	}
	if t, set := c.levelText(s.shownLevel()); set {
		if c.Units != "" {
			t += " " + c.Units
		}
		out["threshold"] = t
	}
	if s.RaisedAt > 0 {
		out["raisedAt"] = isoTime(time.UnixMilli(s.RaisedAt))
	}
	if s.AckBy != "" {
		out["ackBy"] = s.AckBy
		out["ackAt"] = isoTime(time.UnixMilli(s.AckAt))
	}
	if s.shelved(now) {
		out["shelvedUntil"] = isoTime(time.UnixMilli(s.ShelvedUntil))
	}
	return out
}

// sortViewerAlarms: the ones that need attention first (unacknowledged,
// higher level), the shelved ones last.
func sortViewerAlarms(list []map[string]any) {
	rank := func(a map[string]any) int {
		r := 0
		if a["shelved"] == true {
			r += 100
		}
		if a["canAck"] != true {
			r += 10
		}
		switch a["level"] {
		case "Warning":
			r += 1
		case "Normal":
			r += 2
		}
		return r
	}
	sort.SliceStable(list, func(i, j int) bool {
		ri, rj := rank(list[i]), rank(list[j])
		if ri != rj {
			return ri < rj
		}
		return fmt.Sprint(list[i]["key"]) < fmt.Sprint(list[j]["key"])
	})
}
