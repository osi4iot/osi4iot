package common

import (
	"image"
	"time"
)

type File struct {
	Name        string      `json:"name"`
	ContentType string      `json:"content_type"`
	Data        []byte      `json:"data"`
	Image       image.Image `json:"-"`
}

type ReplyContext struct {
	Subject   string
	ExpiresAt time.Time
}

func (r *ReplyContext) IsExpired() bool {
	return time.Now().After(r.ExpiresAt)
}

// Sender is who sent a message, as pipelines knows it (not a payload
// field, which whoever publishes can write): a platform user, from the
// per-user NATS subject it published to (utils.UserChatSubject), or a
// Telegram chat. The AI Agent node keeps each sender's conversation.
type Sender struct {
	User   string
	Source string // SenderSourceNats or SenderSourceTelegram
}

const (
	SenderSourceNats     = "nats"
	SenderSourceTelegram = "telegram"
)

// IsPlatformUser says whether the sender is a platform user connected to
// NATS (the web chat), whose answers go to its own inbox.
func (s *Sender) IsPlatformUser() bool {
	return s != nil && s.Source == SenderSourceNats && s.User != ""
}

type Message interface {
	GetTopic() string
	GetPayload() map[string]any
	GetFieldFromPayload(field string) (any, bool)
	GetStringFromPayload(field string) (string, bool)
	GetMapFromPayload(field string) (map[string]any, bool)
	GetContentType() string
	GetJsonStructure() string
	GetState() map[string]any
	ClearFile()
	Clone() Message
	GetFile() *File
	GetImage() (image.Image, error)
	SetImage(img image.Image, name string, contentType string) error
	AttachAudio(data []byte, name string, contentType string) error
	HasFile() bool
	IsImage() bool
	IsAudio() bool
	GetReplyContext() *ReplyContext
	SetReplyContext(ctx *ReplyContext)
	IsRequest() bool
	GetSender() *Sender
	SetSender(sender *Sender)
}

// InheritSender gives out the sender of in, when out (a message a node
// made from in) has none.
func InheritSender(in, out Message) {
	if in == nil || out == nil || out.GetSender() != nil {
		return
	}
	out.SetSender(in.GetSender())
}
