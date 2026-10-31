package agentdata

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/timeparser"
)

// Field is a value a sensor measures: a numeric field of its messages, or
// one item of an array field ("accelerations[1]"), as the sensor's
// measurements describe them (admin_api's utils/measurements: { "<field>":
// { "type": "number" | "array", "label", "units" } }; for an array, label
// lists the label of each item separated by commas).
type Field struct {
	Name  string `json:"name"`  // temperature, accelerations[1]
	Key   string `json:"-"`     // the message field: temperature, accelerations
	Index int    `json:"-"`     // the array item; -1 for a number
	Label string `json:"label"` // Temperature, Ay
	Units string `json:"units"` // °C, m/s^2 ("" when unknown)
}

// SensorInfo is a sensor of the digital twin's group, as the tools list it.
type SensorInfo struct {
	Uid              string  `json:"uid"`
	Ref              string  `json:"ref"`
	Description      string  `json:"description"`
	Type             string  `json:"type"`
	AssetUid         string  `json:"asset_uid"`
	AssetDescription string  `json:"asset_description"`
	OfDigitalTwin    bool    `json:"of_digital_twin"` // a sensor of the digital twin's asset
	Fields           []Field `json:"fields"`

	topic string // Topic_<topicUid>, as the IoT DB stores it
}

// AssetInfo is an asset of the digital twin's group. Its uid (20
// characters, unique in the platform) is what identifies it without
// doubt; descriptions may repeat.
type AssetInfo struct {
	Uid           string `json:"uid"`
	Description   string `json:"description"`
	Type          string `json:"type"`
	OfDigitalTwin bool   `json:"of_digital_twin"` // the digital twin's own asset
}

func (a AssetInfo) name() string {
	n := a.Uid
	if a.Description != "" {
		n += " (" + a.Description + ")"
	}
	return n
}

// resolveAsset finds the asset a tool call names: "current" (or nothing)
// is the digital twin's own; else its uid or, when no other asset has it,
// its description (any case). An ambiguous description is an error that
// lists the uids.
func resolveAsset(assets []AssetInfo, spec string) (AssetInfo, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" || strings.EqualFold(spec, "current") {
		for _, a := range assets {
			if a.OfDigitalTwin {
				return a, nil
			}
		}
		return AssetInfo{}, fmt.Errorf("the digital twin has no asset in the group")
	}
	for _, a := range assets {
		if strings.EqualFold(a.Uid, spec) {
			return a, nil
		}
	}
	var matches []AssetInfo
	for _, a := range assets {
		if strings.EqualFold(a.Description, spec) {
			matches = append(matches, a)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return AssetInfo{}, fmt.Errorf("no asset %q in the group (use its uid, or 'current' for the digital twin's own)", spec)
	}
	names := make([]string, 0, len(matches))
	for _, a := range matches {
		names = append(names, a.name())
	}
	return AssetInfo{}, fmt.Errorf("several assets are described as %q: %s; use the uid", spec, strings.Join(names, ", "))
}

func sensorFields(s *common.Sensor) []Field {
	keys := make([]string, 0, len(s.Measurements))
	for k := range s.Measurements {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var fields []Field
	for _, key := range keys {
		item, _ := s.Measurements[key].(map[string]any)
		typ, _ := item["type"].(string)
		label, _ := item["label"].(string)
		if label == "" {
			label, _ = item["description"].(string) // older JSON schema format
		}
		units, _ := item["units"].(string)
		if units == "-" {
			units = ""
		}
		if typ != "array" {
			if label == "" {
				label = key
			}
			fields = append(fields, Field{Name: key, Key: key, Index: -1, Label: label, Units: units})
			continue
		}
		labels := strings.Split(label, ",")
		for i, l := range labels {
			l = strings.TrimSpace(l)
			name := fmt.Sprintf("%s[%d]", key, i)
			if l == "" {
				l = name
			}
			fields = append(fields, Field{Name: name, Key: key, Index: i, Label: l, Units: units})
		}
	}
	return fields
}

func newSensorInfo(s *common.Sensor, assets map[int]*common.Asset, dtAssetID int) SensorInfo {
	info := SensorInfo{
		Uid:           s.SensorUid,
		Ref:           s.SensorRef,
		Description:   s.Description,
		Type:          s.SensorType,
		AssetUid:      s.AssetUid,
		OfDigitalTwin: s.AssetId == dtAssetID,
		Fields:        sensorFields(s),
		topic:         "Topic_" + s.TopicUid,
	}
	if a := assets[s.AssetId]; a != nil {
		info.AssetDescription = a.Description
	}
	return info
}

func (s SensorInfo) name() string {
	if s.Description != "" {
		return fmt.Sprintf("%s (%s)", s.Ref, s.Description)
	}
	return s.Ref
}

// resolveSensor finds the sensor a tool call names: by uid, ref or
// description (any case). Without a name, the digital twin's asset's only
// sensor. When several match, the digital twin's asset's is chosen; if
// that does not settle it, the error lists them with their uid and asset
// (the call can then name the sensor's uid, or its asset).
func resolveSensor(sensors []SensorInfo, spec string) (SensorInfo, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		var own []SensorInfo
		for _, s := range sensors {
			if s.OfDigitalTwin {
				own = append(own, s)
			}
		}
		if len(own) == 1 {
			return own[0], nil
		}
		return SensorInfo{}, fmt.Errorf("say which sensor (list-sensors lists them)")
	}

	var matches []SensorInfo
	for _, s := range sensors {
		if strings.EqualFold(s.Uid, spec) || strings.EqualFold(s.Ref, spec) || strings.EqualFold(s.Description, spec) {
			matches = append(matches, s)
		}
	}
	if len(matches) > 1 {
		var own []SensorInfo
		for _, s := range matches {
			if s.OfDigitalTwin {
				own = append(own, s)
			}
		}
		if len(own) == 1 {
			return own[0], nil
		}
		names := make([]string, 0, len(matches))
		for _, s := range matches {
			names = append(names, fmt.Sprintf("%s (uid %s, asset %s)", s.name(), s.Uid, s.AssetUid))
		}
		return SensorInfo{}, fmt.Errorf("%q matches several sensors: %s; use the uid", spec, strings.Join(names, "; "))
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	return SensorInfo{}, fmt.Errorf("no sensor %q in the group (list-sensors lists them)", spec)
}

var fieldItemRe = regexp.MustCompile(`^([A-Za-z_][A-Za-z0-9_.-]*)\[(\d+)\]$`)
var fieldKeyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)

// resolveField finds the field a tool call names: by name
// ("accelerations[1]") or label ("Ay"), any case. Without a name, the
// sensor's only field. A sensor whose measurements are not described
// accepts any "field" or "field[i]".
func resolveField(s SensorInfo, spec string) (Field, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		if len(s.Fields) == 1 {
			return s.Fields[0], nil
		}
		return Field{}, fmt.Errorf("say which field of %s: %s", s.name(), fieldNames(s.Fields))
	}
	for _, f := range s.Fields {
		if strings.EqualFold(f.Name, spec) {
			return f, nil
		}
	}
	var byLabel []Field
	for _, f := range s.Fields {
		if strings.EqualFold(f.Label, spec) {
			byLabel = append(byLabel, f)
		}
	}
	if len(byLabel) == 1 {
		return byLabel[0], nil
	}
	if len(s.Fields) == 0 {
		if m := fieldItemRe.FindStringSubmatch(spec); m != nil {
			i, _ := strconv.Atoi(m[2])
			return Field{Name: spec, Key: m[1], Index: i, Label: spec}, nil
		}
		if fieldKeyRe.MatchString(spec) {
			return Field{Name: spec, Key: spec, Index: -1, Label: spec}, nil
		}
	}
	return Field{}, fmt.Errorf("%s has no field %q: %s", s.name(), spec, fieldNames(s.Fields))
}

func fieldNames(fields []Field) string {
	if len(fields) == 0 {
		return "its measurements are not described"
	}
	names := make([]string, 0, len(fields))
	for _, f := range fields {
		n := f.Name
		if f.Label != f.Name {
			n += " (" + f.Label + ")"
		}
		names = append(names, n)
	}
	return strings.Join(names, ", ")
}

// timeRange reads the from/to of a call: Grafana-like relative times
// ("now-24h", "now/d"), dates and times, or Unix timestamps. Defaults: the
// last 24 hours.
func timeRange(from, to string, now time.Time) (time.Time, time.Time, error) {
	parse := func(s string, def time.Time) (time.Time, error) {
		s = strings.TrimSpace(s)
		if s == "" {
			return def, nil
		}
		p := timeparser.NewGrafanaTimeParserAt(now, time.UTC)
		t, err := p.Parse(s)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid time %q: use e.g. now-24h, now-7d, now/d or 2026-10-30T08:00:00Z", s)
		}
		return t, nil
	}
	f, err := parse(from, now.Add(-24*time.Hour))
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	t, err := parse(to, now)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if !f.Before(t) {
		return time.Time{}, time.Time{}, fmt.Errorf("'from' (%s) must be before 'to' (%s)", f.Format(time.RFC3339), t.Format(time.RFC3339))
	}
	return f.UTC(), t.UTC(), nil
}

const (
	// MaxBuckets bounds the points of an aggregated history.
	MaxBuckets = 500
	// targetBuckets is what "auto" aims for.
	targetBuckets = 120
	// MaxRawPoints bounds the values of a raw history.
	MaxRawPoints = 1000
)

var niceIntervals = []time.Duration{
	time.Minute, 5 * time.Minute, 10 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour,
	24 * time.Hour, 7 * 24 * time.Hour, 30 * 24 * time.Hour,
}

var intervalRe = regexp.MustCompile(`^(\d+)\s*(s|m|h|d|w)$`)

// bucketInterval reads the interval of an aggregated history ("15m",
// "1h", "1d", "auto"), enlarged when the range would have more than
// MaxBuckets of them. adjusted tells that it was enlarged.
func bucketInterval(spec string, from, to time.Time) (d time.Duration, adjusted bool, err error) {
	span := to.Sub(from)
	spec = strings.ToLower(strings.TrimSpace(spec))
	if spec == "" || spec == "auto" {
		for _, n := range niceIntervals {
			if span/n <= targetBuckets {
				return n, false, nil
			}
		}
		return niceIntervals[len(niceIntervals)-1], false, nil
	}
	m := intervalRe.FindStringSubmatch(spec)
	if m == nil {
		return 0, false, fmt.Errorf("invalid interval %q: use e.g. 5m, 1h, 1d, 1w or auto", spec)
	}
	n, _ := strconv.Atoi(m[1])
	unit := map[string]time.Duration{"s": time.Second, "m": time.Minute, "h": time.Hour, "d": 24 * time.Hour, "w": 7 * 24 * time.Hour}[m[2]]
	d = time.Duration(n) * unit
	if d < time.Second {
		return 0, false, fmt.Errorf("the interval must be at least 1s")
	}
	if span/d > MaxBuckets {
		for _, n := range niceIntervals {
			if n > d && span/n <= MaxBuckets {
				return n, true, nil
			}
		}
		return niceIntervals[len(niceIntervals)-1], true, nil
	}
	return d, false, nil
}

// HumanInterval writes an interval as the tools show it: 15m, 1h, 1d.
func HumanInterval(d time.Duration) string {
	switch {
	case d%(7*24*time.Hour) == 0:
		return fmt.Sprintf("%dw", d/(7*24*time.Hour))
	case d%(24*time.Hour) == 0:
		return fmt.Sprintf("%dd", d/(24*time.Hour))
	case d%time.Hour == 0:
		return fmt.Sprintf("%dh", d/time.Hour)
	case d%time.Minute == 0:
		return fmt.Sprintf("%dm", d/time.Minute)
	default:
		return fmt.Sprintf("%ds", d/time.Second)
	}
}
