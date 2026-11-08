package iotdb

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestNewEventIdIsAUUIDv4(t *testing.T) {
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id := NewEventId()
		if !re.MatchString(id) || seen[id] {
			t.Fatalf("bad or repeated id %q", id)
		}
		seen[id] = true
	}
}

func TestTriggerJSONKeepsSmallMessagesAndTruncatesBigOnes(t *testing.T) {
	if TriggerJSON(nil, 100) != nil {
		t.Fatal("nil payload must give NULL")
	}
	small := map[string]any{"temperature": 81.5, "timestamp": 1700000000000.0}
	if got := string(TriggerJSON(small, MaxTriggerBytes)); got != `{"temperature":81.5,"timestamp":1700000000000}` {
		t.Fatalf("small payload: %s", got)
	}
	big := map[string]any{"temperature": 81.5, "image": strings.Repeat("x", 50000), "pressure": 2.1}
	b := TriggerJSON(big, 1000)
	if len(b) > 1000 {
		t.Fatalf("truncated copy is %d bytes", len(b))
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["_truncated"] != true || m["temperature"] != 81.5 || m["pressure"] != 2.1 || m["image"] != nil {
		t.Fatalf("truncated copy: %v", m)
	}
	if m["_bytes"].(float64) < 50000 {
		t.Fatalf("_bytes: %v", m["_bytes"])
	}
}

func TestRowsMatchTheirColumns(t *testing.T) {
	raised := time.UnixMilli(1700000000000)
	a := AlarmArgs(AlarmRecord{EventId: "e", Event: "raised", RaisedAt: &raised, Value: 92.0, Config: map[string]any{}})
	if len(a) != len(AlarmColumns) {
		t.Fatalf("alarm: %d values for %d columns", len(a), len(AlarmColumns))
	}
	if a[0].(time.Time).IsZero() {
		t.Fatal("an event without time gets now")
	}
	p := ApprovalArgs(ApprovalRecord{EventId: "e", Event: "requested"})
	if len(p) != len(ApprovalColumns) {
		t.Fatalf("approval: %d values for %d columns", len(p), len(ApprovalColumns))
	}
	if clip("ñandú", 3) != "ñan" {
		t.Fatal("clip counts characters")
	}
}

func TestInsertSQL(t *testing.T) {
	got := InsertSQL("iot_data.x", []string{"time", "event_id"}, 2)
	want := "INSERT INTO iot_data.x (time, event_id) VALUES ($1, $2), ($3, $4) ON CONFLICT (event_id, time) DO NOTHING"
	if got != want {
		t.Fatalf("%s", got)
	}
}

func TestSameTableBatch(t *testing.T) {
	rows := []historyRow{{table: "a"}, {table: "a"}, {table: "b"}, {table: "a"}}
	if n := len(sameTableBatch(rows, 10)); n != 2 {
		t.Fatalf("got %d", n)
	}
	if n := len(sameTableBatch(rows, 1)); n != 1 {
		t.Fatalf("got %d", n)
	}
}
