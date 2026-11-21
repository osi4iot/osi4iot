package pipelinelog

import (
	"strings"
	"testing"
	"unicode/utf8"
)

const subject = "dtmlog.Group_g123.Topic_t456"

func fieldsOf(t *testing.T, r Record) map[string]any {
	t.Helper()
	if len(r.Fields)%2 != 0 {
		t.Fatalf("odd number of fields: %v", r.Fields)
	}
	m := map[string]any{}
	for i := 0; i < len(r.Fields); i += 2 {
		m[r.Fields[i].(string)] = r.Fields[i+1]
	}
	return m
}

func TestRecordOfKeepsTheFieldsOfALog(t *testing.T) {
	r, ok := RecordOf(subject, []byte(`{"level":"warning","component":"node","name":"Pump","uid":"n1",
		"message":"pressure high","description":"Warning from node","payload":{"big":[1,2,3]},"state":{"x":1}}`))
	if !ok {
		t.Fatal("a warning must be kept")
	}
	if r.Level != "warn" || r.Message != "pressure high" {
		t.Fatalf("level %q message %q", r.Level, r.Message)
	}
	f := fieldsOf(t, r)
	want := map[string]any{"event": Event, "groupUid": "g123", "topicUid": "t456", "component": "node",
		"name": "Pump", "uid": "n1", "description": "Warning from node"}
	for k, v := range want {
		if f[k] != v {
			t.Errorf("%s = %v, want %v", k, f[k], v)
		}
	}
	if _, has := f["payload"]; has {
		t.Error("the payload is not kept")
	}
	// Vector takes these keys for its own columns: they must not be fields
	for _, k := range []string{"level", "message", "msg", "trace_id"} {
		if _, has := f[k]; has {
			t.Errorf("field %q would be taken by Vector", k)
		}
	}
}

func TestRecordOfLevels(t *testing.T) {
	cases := map[string]string{"error": "error", "ERROR": "error", "warn": "warn", "warning": "warn", "info": "info", "": "info", "other": "info"}
	for in, want := range cases {
		r, ok := RecordOf(subject, []byte(`{"level":"`+in+`","message":"m"}`))
		if !ok || r.Level != want {
			t.Errorf("level %q: got %q (%v), want %q", in, r.Level, ok, want)
		}
	}
	if _, ok := RecordOf(subject, []byte(`{"level":"debug","message":"m"}`)); ok {
		t.Error("debug messages are not kept")
	}
}

func TestRecordOfOnlyDtmlogSubjects(t *testing.T) {
	data := []byte(`{"level":"error","message":"m"}`)
	for _, s := range []string{"dtm2sim.Group_g.Topic_t", "dtmlog.Group_g", "dtmlog.Group_.Topic_t", "dtmlog.G_g.Topic_t", "dtmlog.Group_g.Topic_t.x", ""} {
		if _, ok := RecordOf(s, data); ok {
			t.Errorf("subject %q must not be kept", s)
		}
	}
	if _, ok := RecordOf(subject, []byte(`not json`)); ok {
		t.Error("a message that is not a log is not kept")
	}
	if _, ok := RecordOf(subject, []byte(`{"level":"error"}`)); ok {
		t.Error("a log without text is not kept")
	}
}

func TestRecordOfMessageFallsBackAndIsCut(t *testing.T) {
	r, _ := RecordOf(subject, []byte(`{"level":"info","description":"only the description"}`))
	if r.Message != "only the description" {
		t.Errorf("message %q", r.Message)
	}
	r, _ = RecordOf(subject, []byte(`{"level":"info","name":"DT: Pump"}`))
	if r.Message != "DT: Pump" {
		t.Errorf("message %q", r.Message)
	}
	long := strings.Repeat("ñ", MaxMessage+50)
	r, _ = RecordOf(subject, []byte(`{"level":"error","message":"`+long+`"}`))
	if n := utf8.RuneCountInString(r.Message); n != MaxMessage || !utf8.ValidString(r.Message) {
		t.Errorf("cut message: %d characters, valid %v", n, utf8.ValidString(r.Message))
	}
}

func TestKeepIgnoresOtherSubjects(t *testing.T) {
	// must not panic nor write: just exercises the path
	Keep("dev2pdb.Group_g.Topic_t", []byte(`{"level":"error","message":"m"}`))
	Keep(subject, []byte(`{"level":"debug","message":"m"}`))
}
