package nodes

// The rows of the history of alarms and approvals (iotdb/history.go) built
// from the nodes' events (pure: no database, no NATS).

import (
	"strings"
	"time"

	"pipelines/iotdb"
)

func timePtr(ms int64) *time.Time {
	if ms <= 0 {
		return nil
	}
	t := time.UnixMilli(ms)
	return &t
}

func eventText(e map[string]any, field string) string {
	s, _ := e[field].(string)
	return s
}

// alarmHistoryConfig: the settings of the alarm that explain its events.
func (c *alarmConfig) historyConfig() map[string]any {
	cfg := map[string]any{
		"condition":       c.Condition,
		"hysteresis":      c.Hysteresis,
		"onDelaySeconds":  c.OnDelay.Seconds(),
		"offDelaySeconds": c.OffDelay.Seconds(),
		"latched":         c.Latched,
	}
	if c.Warning != "" {
		cfg["warning"] = c.Warning
	}
	if c.Alarm != "" {
		cfg["alarm"] = c.Alarm
	}
	if c.KeyPath != "" {
		cfg["keyPath"] = c.KeyPath
	}
	return cfg
}

// alarmHistoryRecord is the row of an alarm event. s is the alarm after the
// event (or before it, when the event removed it); shelved says whether the
// event happened while shelved (it was not sent on); topic and payload are
// the message that caused it ("" and nil from the clock).
func (c *alarmConfig) alarmHistoryRecord(hc iotdb.HistoryContext, e map[string]any, s *alarmState, key string, now time.Time,
	shelved bool, topic string, payload map[string]any) iotdb.AlarmRecord {
	kind := eventText(e, "event")
	rec := iotdb.AlarmRecord{
		Ctx:            hc,
		Time:           now,
		EventId:        iotdb.NewEventId(),
		AlarmName:      c.Name,
		AlarmKey:       key,
		Event:          kind,
		Level:          eventText(e, "level"),
		State:          eventText(e, "state"),
		Shelved:        shelved,
		Value:          e["value"],
		Threshold:      eventText(e, "threshold"),
		Property:       c.Property,
		Condition:      c.Condition,
		Units:          c.Units,
		Description:    c.Description,
		Message:        eventText(e, "message"),
		Config:         c.historyConfig(),
		EventData:      e,
		TriggerTopic:   topic,
		TriggerPayload: payload,
	}
	if s != nil {
		rec.RaisedAt = timePtr(s.RaisedAt)
		rec.AckBy = s.AckBy
		rec.AckAt = timePtr(s.AckAt)
		if rec.Value == nil {
			rec.Value = s.Value
		}
	}
	switch kind {
	case "acknowledged":
		rec.UserName = rec.AckBy
	case "reset":
		rec.UserName = eventText(e, "resetBy")
	case "shelved", "unshelved":
		rec.UserName = eventText(e, "shelvedBy")
	}
	return rec
}

// approvalHistoryRecord is the row of an approval event: "requested" (with
// the message that waits) or the decision ("approved", "rejected",
// "expired").
func approvalHistoryRecord(hc iotdb.HistoryContext, channel string, r *approvalRequest, event, by, via, comment string, at time.Time) iotdb.ApprovalRecord {
	rec := iotdb.ApprovalRecord{
		Ctx:            hc,
		Time:           at,
		EventId:        iotdb.NewEventId(),
		RequestId:      r.Id,
		Event:          event,
		Title:          r.Title,
		Detail:         r.Detail,
		Channel:        channel,
		RequestedAt:    time.UnixMilli(r.Created),
		ExpiresAt:      timePtr(r.Expires),
		TriggerTopic:   r.Topic,
		TriggerPayload: r.Payload,
	}
	if event != "requested" {
		decided := at
		wait := at.Sub(rec.RequestedAt).Seconds()
		if wait < 0 {
			wait = 0
		}
		rec.DecidedAt, rec.DecidedBy, rec.Via, rec.Comment, rec.WaitSeconds = &decided, by, via, strings.TrimSpace(comment), &wait
	}
	return rec
}
