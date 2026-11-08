package iotdb

// History of the alarms and approvals (IoT DB, patroni_metrics): one row per
// event in the hypertables iot_data.alarm and iot_data.approval, kept 2 years
// (init_metrics.sql.template), to follow them over time and to train models.
// Rows are only inserted, never changed: each one carries a copy of the
// message that caused it (trigger_payload, at most MaxTriggerBytes) because
// the measurements in iot_data.thingData may be deleted sooner.
//
// This file is pure (no database): the rows and their SQL. historyRecorder.go
// writes them in batches.

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// MaxTriggerBytes: the largest copy of a message kept in a row (JSON). A
// larger one is replaced by its top-level fields that fit, with
// "_truncated": true and "_bytes": its full size.
const MaxTriggerBytes = 16 * 1024

// HistoryContext is where an event happened: the node and its digital twin,
// asset and group (names as they were then, for reading the history).
type HistoryContext struct {
	OrgId                  int
	GroupId                int
	GroupUid               string
	AssetId                int
	AssetUid               string
	AssetDescription       string
	DigitalTwinId          int
	DigitalTwinUid         string
	DigitalTwinDescription string
	NodeUid                string
	NodeName               string
}

// AlarmRecord is one event of an Alarm node.
type AlarmRecord struct {
	Ctx            HistoryContext
	Time           time.Time
	EventId        string
	AlarmName      string
	AlarmKey       string
	Event          string // raised, escalated, deescalated, reactivated, cleared, latched, acknowledged, reset, shelved, unshelved
	Level          string // Normal, Warning, Alarm
	State          string // normal, active_unack, active_ack, rtn_unack, latched, shelved
	Shelved        bool   // the event happened while the alarm was shelved (it was not sent on)
	RaisedAt       *time.Time
	Value          any
	Threshold      string
	Property       string
	Condition      string
	Units          string
	Description    string
	AckBy          string
	AckAt          *time.Time
	UserName       string // who acknowledged, shelved or reset it (event by a person)
	Message        string
	Config         map[string]any // the node's alarm settings at the time
	EventData      map[string]any // the event as the node sent it
	TriggerTopic   string
	TriggerPayload map[string]any
}

// ApprovalRecord is one event of an Approval node.
type ApprovalRecord struct {
	Ctx            HistoryContext
	Time           time.Time
	EventId        string
	RequestId      string
	Event          string // requested, approved, rejected, expired
	Title          string
	Detail         string
	Channel        string // viewer, telegram, both
	RequestedAt    time.Time
	ExpiresAt      *time.Time
	DecidedAt      *time.Time
	DecidedBy      string
	Via            string // viewer, telegram ("" expired or rejected by the node)
	Comment        string
	WaitSeconds    *float64 // from the request to the decision
	TriggerTopic   string
	TriggerPayload map[string]any
}

// NewEventId is a random UUID (v4): the key that makes inserting a row twice
// (a retried batch) harmless.
func NewEventId() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// TriggerJSON is the copy of a message's payload kept in a row: null without
// one; at most max bytes (see MaxTriggerBytes).
func TriggerJSON(payload map[string]any, max int) []byte {
	if payload == nil {
		return nil
	}
	full, err := json.Marshal(payload)
	if err != nil {
		b, _ := json.Marshal(map[string]any{"_error": err.Error()})
		return b
	}
	if len(full) <= max {
		return full
	}
	// the top-level fields that fit, smallest first (the measurements are
	// usually small; an image or a long list is what does not fit)
	type field struct {
		name string
		raw  json.RawMessage
	}
	fields := make([]field, 0, len(payload))
	for k, v := range payload {
		raw, err := json.Marshal(v)
		if err != nil {
			continue
		}
		fields = append(fields, field{k, raw})
	}
	for i := 1; i < len(fields); i++ { // insertion sort: by size, then by name (stable output)
		for j := i; j > 0; j-- {
			a, b := fields[j-1], fields[j]
			if len(a.raw) < len(b.raw) || len(a.raw) == len(b.raw) && a.name <= b.name {
				break
			}
			fields[j-1], fields[j] = b, a
		}
	}
	out := map[string]json.RawMessage{
		"_truncated": json.RawMessage("true"),
		"_bytes":     json.RawMessage(fmt.Sprint(len(full))),
	}
	size := 40
	for _, f := range fields {
		add := len(f.name) + len(f.raw) + 4
		if size+add > max {
			continue
		}
		out[f.name] = f.raw
		size += add
	}
	b, _ := json.Marshal(out)
	return b
}

func jsonOrNil(v any) []byte {
	if v == nil {
		return nil
	}
	if m, ok := v.(map[string]any); ok && len(m) == 0 {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}

func nonEmptyTime(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now()
	}
	return t
}

func contextArgs(c HistoryContext) []any {
	return []any{c.OrgId, c.GroupId, c.GroupUid, c.AssetId, c.AssetUid, clip(c.AssetDescription, 190),
		c.DigitalTwinId, c.DigitalTwinUid, clip(c.DigitalTwinDescription, 190), c.NodeUid, clip(c.NodeName, 190)}
}

var contextColumns = []string{"org_id", "group_id", "group_uid", "asset_id", "asset_uid", "asset_description",
	"digital_twin_id", "digital_twin_uid", "digital_twin_description", "node_uid", "node_name"}

// clip shortens a text to n characters (the varchar columns).
func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

var AlarmColumns = append(append([]string{"time", "event_id"}, contextColumns...),
	"alarm_name", "alarm_key", "event", "level", "state", "shelved", "raised_at", "value", "threshold", "property",
	"condition", "units", "description", "ack_by", "ack_at", "user_name", "message", "config", "event_data",
	"trigger_topic", "trigger_payload")

// AlarmArgs are the values of a row, in the order of AlarmColumns.
func AlarmArgs(r AlarmRecord) []any {
	args := []any{nonEmptyTime(r.Time), r.EventId}
	args = append(args, contextArgs(r.Ctx)...)
	return append(args,
		clip(r.AlarmName, 190), clip(r.AlarmKey, 255), r.Event, r.Level, r.State, r.Shelved, r.RaisedAt,
		jsonOrNil(r.Value), clip(r.Threshold, 255), clip(r.Property, 255), r.Condition, clip(r.Units, 40),
		r.Description, clip(r.AckBy, 190), r.AckAt, clip(r.UserName, 190), r.Message, jsonOrNil(r.Config),
		jsonOrNil(r.EventData), clip(r.TriggerTopic, 1024), TriggerJSON(r.TriggerPayload, MaxTriggerBytes))
}

var ApprovalColumns = append(append([]string{"time", "event_id"}, contextColumns...),
	"request_id", "event", "title", "detail", "channel", "requested_at", "expires_at", "decided_at", "decided_by",
	"via", "comment", "wait_seconds", "trigger_topic", "trigger_payload")

// ApprovalArgs are the values of a row, in the order of ApprovalColumns.
func ApprovalArgs(r ApprovalRecord) []any {
	args := []any{nonEmptyTime(r.Time), r.EventId}
	args = append(args, contextArgs(r.Ctx)...)
	return append(args,
		r.RequestId, r.Event, r.Title, r.Detail, r.Channel, nonEmptyTime(r.RequestedAt), r.ExpiresAt, r.DecidedAt,
		clip(r.DecidedBy, 190), r.Via, r.Comment, r.WaitSeconds, clip(r.TriggerTopic, 1024),
		TriggerJSON(r.TriggerPayload, MaxTriggerBytes))
}

// InsertSQL inserts rows rows of the columns into the table; a row already
// there (same event_id and time) is skipped.
func InsertSQL(table string, columns []string, rows int) string {
	var sb strings.Builder
	sb.WriteString("INSERT INTO ")
	sb.WriteString(table)
	sb.WriteString(" (")
	sb.WriteString(strings.Join(columns, ", "))
	sb.WriteString(") VALUES ")
	n := 1
	for r := 0; r < rows; r++ {
		if r > 0 {
			sb.WriteString(", ")
		}
		sb.WriteByte('(')
		for c := range columns {
			if c > 0 {
				sb.WriteString(", ")
			}
			fmt.Fprintf(&sb, "$%d", n)
			n++
		}
		sb.WriteByte(')')
	}
	sb.WriteString(" ON CONFLICT (event_id, time) DO NOTHING")
	return sb.String()
}

// historyRow is a row waiting to be written.
type historyRow struct {
	table   string
	columns []string
	args    []any
}

// sameTableBatch: the first rows (at most max) of the same table as the first.
func sameTableBatch(rows []historyRow, max int) []historyRow {
	n := 1
	for n < len(rows) && n < max && rows[n].table == rows[0].table {
		n++
	}
	return rows[:n]
}
