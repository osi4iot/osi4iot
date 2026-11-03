package nodes

// Approval node logic (pure): a message waits until a person approves or
// rejects it, or until it expires.
//
// Who decides: only administrators of the digital twin's group (group,
// organization or platform administrators), through
//   - the viewer: the node's button publishes on the user's own copy of the
//     digital twin's "approval" topic (user.<login>.approval.Group_..., which
//     auth_callout only lets the NATS users who administer the group
//     publish to), with the header Approval-Node = the node's UID; pipelines
//     takes the user from the subject;
//   - Telegram: the request is sent to a chat with Approve / Reject buttons;
//     the platform user is the one linked to the Telegram account that
//     pressed (profile → Telegram link) and must administer the group.
//
// Outputs: 0 approved and 1 rejected (the original message, with
// payload.approval), 2 expired (likewise), 3 a notification of each new
// request (to wire to Email, Telegram...).

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	approvalNodeHeader     = "Approval-Node"
	approvalTopicRef       = "approval"
	approvalCallbackPrefix = "apv:"
	approvalMaxPending     = 100

	approvalChannelViewer   = "viewer"
	approvalChannelTelegram = "telegram"
	approvalChannelBoth     = "both"

	approvalOutputApproved = 0
	approvalOutputRejected = 1
	approvalOutputExpired  = 2
	approvalOutputRequests = 3
)

type approvalConfig struct {
	Channel     string
	Title       string
	DetailField string
	Timeout     time.Duration // 0: never expires
	ChatId      int64
}

// approvalRequest is a pending request (one KV entry each).
type approvalRequest struct {
	Id                string         `json:"id"`
	Created           int64          `json:"created"`
	Expires           int64          `json:"expires,omitempty"`
	Title             string         `json:"title"`
	Detail            string         `json:"detail,omitempty"`
	Topic             string         `json:"topic"`
	Payload           map[string]any `json:"payload"`
	State             map[string]any `json:"state,omitempty"`
	TelegramChatId    int64          `json:"telegramChatId,omitempty"`
	TelegramMessageId int64          `json:"telegramMessageId,omitempty"`
}

func parseApprovalConfig(settings map[string]any) (*approvalConfig, error) {
	cfg := &approvalConfig{
		Channel:     settingString(settings, "channel", approvalChannelViewer),
		Title:       settingString(settings, "title", "Approval request"),
		DetailField: settingString(settings, "detailField", ""),
		Timeout:     time.Duration(settingNumber(settings, "timeoutMinutes", 60) * float64(time.Minute)),
	}
	switch cfg.Channel {
	case approvalChannelViewer, approvalChannelTelegram, approvalChannelBoth:
	default:
		return nil, fmt.Errorf("the channel must be viewer, telegram or both")
	}
	if cfg.Timeout < 0 {
		return nil, fmt.Errorf("the timeout cannot be negative")
	}
	if cfg.usesTelegram() {
		chat := settingString(settings, "chatId", "")
		if chat == "" {
			if v, ok := toNumber(settings["chatId"]); ok {
				chat = fmt.Sprintf("%.0f", v)
			}
		}
		var id int64
		if _, err := fmt.Sscanf(chat, "%d", &id); err != nil || id == 0 || fmt.Sprint(id) != chat {
			return nil, fmt.Errorf("the Telegram chat id is required (a number, negative for groups)")
		}
		cfg.ChatId = id
	}
	return cfg, nil
}

func (c *approvalConfig) usesViewer() bool {
	return c.Channel == approvalChannelViewer || c.Channel == approvalChannelBoth
}

func (c *approvalConfig) usesTelegram() bool {
	return c.Channel == approvalChannelTelegram || c.Channel == approvalChannelBoth
}

const approvalIdAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// newApprovalId is a short random id (it goes in Telegram's callback data,
// 64 bytes at most with the node's UID).
func newApprovalId() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	for i := range b {
		b[i] = approvalIdAlphabet[int(b[i])%len(approvalIdAlphabet)]
	}
	return string(b)
}

// newRequest is the request for a message arrived at `now`.
func (c *approvalConfig) newRequest(topic string, payload, state map[string]any, now time.Time) *approvalRequest {
	r := &approvalRequest{
		Id: newApprovalId(), Created: now.UnixMilli(), Title: c.Title,
		Topic: topic, Payload: payload, State: state,
	}
	if c.Timeout > 0 {
		r.Expires = now.Add(c.Timeout).UnixMilli()
	}
	if c.DetailField != "" {
		if value, ok := lookupPath(topic, payload, c.DetailField); ok {
			r.Detail = detailText(value)
		}
	}
	return r
}

// detailText shows a value to the person who decides (texts as they are,
// the rest as JSON), up to 1000 characters.
func detailText(value any) string {
	var text string
	if s, ok := value.(string); ok {
		text = s
	} else if b, err := json.Marshal(value); err == nil {
		text = string(b)
	} else {
		text = fmt.Sprint(value)
	}
	if r := []rune(text); len(r) > 1000 {
		text = string(r[:1000]) + "…"
	}
	return text
}

func (r *approvalRequest) expired(now time.Time) bool {
	return r.Expires > 0 && !now.Before(time.UnixMilli(r.Expires))
}

// summary is what the viewer lists and the notification output says.
func (r *approvalRequest) summary() map[string]any {
	s := map[string]any{
		"requestId": r.Id,
		"title":     r.Title,
		"created":   isoTime(time.UnixMilli(r.Created)),
	}
	if r.Detail != "" {
		s["detail"] = r.Detail
	}
	if r.Expires > 0 {
		s["expires"] = isoTime(time.UnixMilli(r.Expires))
	}
	return s
}

// notification is the message of output 3 for a new request.
func (r *approvalRequest) notification(channel string) map[string]any {
	n := r.summary()
	n["event"] = "request"
	n["channel"] = channel
	text := "Approval needed: " + r.Title
	if r.Detail != "" {
		text += "\n" + r.Detail
	}
	n["message"] = text
	return n
}

// decisionPayload is the original payload with payload.approval: the
// decision ("approved", "rejected" or "expired"), who decided and how.
func (r *approvalRequest) decisionPayload(decision, by, via, comment string, at time.Time) map[string]any {
	payload := make(map[string]any, len(r.Payload)+1)
	for k, v := range r.Payload {
		payload[k] = v
	}
	approval := map[string]any{
		"requestId": r.Id,
		"decision":  decision,
		"title":     r.Title,
		"requested": isoTime(time.UnixMilli(r.Created)),
		"decided":   isoTime(at),
	}
	if by != "" {
		approval["by"] = by
	}
	if via != "" {
		approval["via"] = via
	}
	if comment = strings.TrimSpace(comment); comment != "" {
		if r := []rune(comment); len(r) > 500 {
			comment = string(r[:500])
		}
		approval["comment"] = comment
	}
	payload["approval"] = approval
	return payload
}

// telegramText is the text of the request in Telegram (decision: "" while
// it waits).
func (r *approvalRequest) telegramText(decision, by string, at time.Time, loc *time.Location) string {
	var b strings.Builder
	switch decision {
	case "":
		b.WriteString("🔔 Approval needed: ")
	case "approved":
		b.WriteString("✅ Approved: ")
	case "rejected":
		b.WriteString("❌ Rejected: ")
	case "expired":
		b.WriteString("⌛ Expired: ")
	}
	b.WriteString(r.Title)
	if r.Detail != "" {
		b.WriteString("\n");b.WriteString(r.Detail)
	}
	if decision == "" {
		if r.Expires > 0 {
			b.WriteString("\nExpires: ");b.WriteString(time.UnixMilli(r.Expires).In(loc).Format("2006-01-02 15:04"))
		}
		b.WriteString("\nOnly group administrators with a linked Telegram account can decide.")
	} else {
		b.WriteString("\n");b.WriteString(at.In(loc).Format("2006-01-02 15:04"))
		if by != "" {
			b.WriteString(" by ");b.WriteString(by)
		}
	}
	return b.String()
}

// approvalCallback is the data of a Telegram button: prefix, node, request
// and a (approve) or r (reject).
func approvalCallback(nodeUid, requestId string, approve bool) string {
	action := "r"
	if approve {
		action = "a"
	}
	return approvalCallbackPrefix + nodeUid + ":" + requestId + ":" + action
}

// parseApprovalCallback reads the data of a button of this node.
func parseApprovalCallback(data, nodeUid string) (requestId string, approve bool, ok bool) {
	rest, found := strings.CutPrefix(data, approvalCallbackPrefix+nodeUid+":")
	if !found {
		return "", false, false
	}
	requestId, action, found := strings.Cut(rest, ":")
	if !found || requestId == "" || (action != "a" && action != "r") {
		return "", false, false
	}
	return requestId, action == "a", true
}

// approvalViewerRequest is what the viewer's button sends.
type approvalViewerRequest struct {
	Action    string `json:"action"` // "list", "approve" or "reject"
	RequestId string `json:"requestId,omitempty"`
	Comment   string `json:"comment,omitempty"`
}
