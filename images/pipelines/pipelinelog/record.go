// Package pipelinelog keeps the pipeline logs (README, "Control room"): every message published on a dtmlog
// subject, except the debug ones, is also written as one JSON line to the service's output. Vector stores the
// lines of every service in observability.log_entries (7 days; it drops the debug level), and this one carries
// event "pipeline_log", the uids of the group and of the dtmlog topic (from the subject) and the fields of the
// log (common.PipelineLog). admin_api reads them for the Pipeline logs panel of the group's control room
// (GET /control_room_logs/:groupId/:digitalTwinId); the panel adds the live ones by NATS.
//
// Debug messages (what a node with debug on sends to its output, with the payload) stay live only: they are
// many and big. The payload and state of the others are not kept either, only the texts.
package pipelinelog

import (
	"encoding/json"
	"strings"
	"sync"
	"unicode/utf8"

	"go.uber.org/zap"
)

const (
	// Event is the "event" of the lines in observability.log_entries.metadata (admin_api looks for it)
	Event = "pipeline_log"
	// the longest texts kept (a stack trace or a model's answer may be very long)
	MaxMessage     = 4000
	MaxDescription = 500
	MaxName        = 190
)

// the fields of a dtmlog message that are kept (common.PipelineLog)
type logMessage struct {
	Level       string `json:"level"`
	Component   string `json:"component"`
	Name        string `json:"name"`
	Uid         string `json:"uid"`
	Message     string `json:"message"`
	Description string `json:"description"`
}

// Record is one line: its level (error, warn or info, as zap names them), its message and the other fields
type Record struct {
	Level   string
	Message string
	Fields  []any
}

// RecordOf is the line of a message published on subject, or false when nothing is kept: not a dtmlog subject
// ("dtmlog.Group_<uid>.Topic_<uid>"), not a log, or a debug one.
func RecordOf(subject string, data []byte) (Record, bool) {
	parts := strings.Split(subject, ".")
	if len(parts) != 3 || parts[0] != "dtmlog" ||
		!strings.HasPrefix(parts[1], "Group_") || !strings.HasPrefix(parts[2], "Topic_") {
		return Record{}, false
	}
	groupUid := strings.TrimPrefix(parts[1], "Group_")
	topicUid := strings.TrimPrefix(parts[2], "Topic_")
	if groupUid == "" || topicUid == "" {
		return Record{}, false
	}
	var m logMessage
	if err := json.Unmarshal(data, &m); err != nil {
		return Record{}, false
	}
	var level string
	switch strings.ToLower(strings.TrimSpace(m.Level)) {
	case "debug":
		return Record{}, false
	case "error", "fatal":
		level = "error"
	case "warning", "warn":
		level = "warn"
	default:
		level = "info"
	}
	message := m.Message
	if message == "" {
		message = m.Description
	}
	if message == "" {
		message = m.Name
	}
	if strings.TrimSpace(message) == "" {
		return Record{}, false
	}
	return Record{
		Level:   level,
		Message: truncate(message, MaxMessage),
		Fields: []any{
			"event", Event,
			"groupUid", groupUid,
			"topicUid", topicUid,
			"component", truncate(m.Component, 40),
			"name", truncate(m.Name, MaxName),
			"uid", truncate(m.Uid, 64),
			"description", truncate(m.Description, MaxDescription),
		},
	}, true
}

// truncate cuts s to at most max characters (not bytes: never in the middle of a character)
func truncate(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max-1]) + "…"
}

// the writer of the lines: zap's production JSON (as the service's own logger) without time (Vector takes
// Docker's), caller or stack trace. Its sampling protects the database from a node that fails in a loop: of
// the same message and level, the first 100 of each second, then 1 of every 100.
var writer = sync.OnceValue(func() *zap.SugaredLogger {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = ""
	cfg.DisableCaller = true
	cfg.DisableStacktrace = true
	l, err := cfg.Build()
	if err != nil {
		return zap.NewNop().Sugar()
	}
	return l.Sugar()
})

// Keep writes the line of a message published on subject, if it is a pipeline log worth keeping
func Keep(subject string, data []byte) {
	if !strings.HasPrefix(subject, "dtmlog.") {
		return
	}
	r, ok := RecordOf(subject, data)
	if !ok {
		return
	}
	w := writer()
	switch r.Level {
	case "error":
		w.Errorw(r.Message, r.Fields...)
	case "warn":
		w.Warnw(r.Message, r.Fields...)
	default:
		w.Infow(r.Message, r.Fields...)
	}
}
