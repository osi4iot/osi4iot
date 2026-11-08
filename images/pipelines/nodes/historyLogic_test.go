package nodes

import (
	"testing"
	"time"

	"pipelines/iotdb"
)

func TestAlarmHistoryRecordsEveryEventWithItsContext(t *testing.T) {
	cfg := mustAlarmConfig(t, map[string]any{
		"property": "payload.temperature", "condition": "high", "warning": 70, "alarm": 85,
		"hysteresis": 2, "units": "°C", "description": "Motor winding",
	})
	hc := iotdb.HistoryContext{OrgId: 1, GroupId: 3, DigitalTwinId: 7, NodeUid: "n1", NodeName: "Motor temperature"}
	t0 := time.UnixMilli(1_700_000_000_000)
	payload := map[string]any{"temperature": 90.0, "timestamp": 1_700_000_000_000.0}

	raise, _ := cfg.evaluate(nil, "motor-1", "dev2pdb.G.T", 90.0, t0)
	if len(raise.Events) == 0 {
		t.Fatal("no event")
	}
	rec := cfg.alarmHistoryRecord(hc, raise.Events[0], raise.Next, "motor-1", t0, false, "dev2pdb.G.T", payload)
	if rec.Event != "raised" || rec.Level != "Alarm" || rec.State != "active_unack" || rec.AlarmKey != "motor-1" {
		t.Fatalf("raised: %+v", rec)
	}
	if rec.RaisedAt == nil || !rec.RaisedAt.Equal(t0) || rec.Value != 90.0 || rec.Units != "°C" || rec.Threshold == "" {
		t.Fatalf("raised details: %+v", rec)
	}
	if rec.Config["alarm"] != "85" || rec.Config["hysteresis"] != 2.0 || rec.TriggerPayload["temperature"] != 90.0 || rec.Ctx.NodeUid != "n1" {
		t.Fatalf("config, trigger or context: %+v", rec)
	}
	if rec.EventId == "" || rec.UserName != "" {
		t.Fatalf("id or user: %+v", rec)
	}
	if len(iotdb.AlarmArgs(rec)) != len(iotdb.AlarmColumns) {
		t.Fatal("row and columns differ")
	}

	ack := cfg.acknowledge(raise.Next, "motor-1", "ana", t0.Add(time.Minute))
	rec = cfg.alarmHistoryRecord(hc, ack.Events[0], ack.Next, "motor-1", t0.Add(time.Minute), false, "", nil)
	if rec.Event != "acknowledged" || rec.UserName != "ana" || rec.AckBy != "ana" || rec.AckAt == nil {
		t.Fatalf("acknowledged: %+v", rec)
	}

	shelve := cfg.shelve(ack.Next, "motor-1", 30*time.Minute, "luis", t0.Add(2*time.Minute))
	rec = cfg.alarmHistoryRecord(hc, shelve.Events[0], shelve.Next, "motor-1", t0.Add(2*time.Minute), false, "", nil)
	if rec.Event != "shelved" || rec.UserName != "luis" || rec.State != "shelved" {
		t.Fatalf("shelved: %+v", rec)
	}
	unshelve := cfg.shelve(shelve.Next, "motor-1", 0, "luis", t0.Add(3*time.Minute))
	if unshelve.Events[0]["shelvedBy"] != "luis" {
		t.Fatalf("unshelved: %v", unshelve.Events[0])
	}
}

func TestApprovalHistoryRecords(t *testing.T) {
	cfg, err := parseApprovalConfig(map[string]any{"title": "Change the setpoint", "detailField": "payload.setpoint", "timeoutMinutes": 10})
	if err != nil {
		t.Fatal(err)
	}
	t0 := time.UnixMilli(1_700_000_000_000)
	req := cfg.newRequest("sim2dtm.G.T", map[string]any{"setpoint": 42.0}, nil, t0)
	hc := iotdb.HistoryContext{GroupId: 3, NodeUid: "ap"}

	rec := approvalHistoryRecord(hc, "viewer", req, "requested", "", "", "", t0)
	if rec.Event != "requested" || rec.RequestId != req.Id || rec.Title != "Change the setpoint" || rec.Detail != "42" {
		t.Fatalf("requested: %+v", rec)
	}
	if rec.DecidedAt != nil || rec.WaitSeconds != nil || rec.ExpiresAt == nil || rec.TriggerPayload["setpoint"] != 42.0 {
		t.Fatalf("requested details: %+v", rec)
	}

	at := t0.Add(90 * time.Second)
	rec = approvalHistoryRecord(hc, "viewer", req, "approved", "ana", "viewer", "  ok  ", at)
	if rec.Event != "approved" || rec.DecidedBy != "ana" || rec.Via != "viewer" || rec.Comment != "ok" {
		t.Fatalf("approved: %+v", rec)
	}
	if rec.DecidedAt == nil || !rec.DecidedAt.Equal(at) || *rec.WaitSeconds != 90 || !rec.RequestedAt.Equal(t0) {
		t.Fatalf("approved times: %+v", rec)
	}
	if len(iotdb.ApprovalArgs(rec)) != len(iotdb.ApprovalColumns) {
		t.Fatal("row and columns differ")
	}
}
