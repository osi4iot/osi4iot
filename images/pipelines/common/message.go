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
	HasFile() bool
	IsImage() bool
	IsAudio() bool
	GetReplyContext() *ReplyContext
	SetReplyContext(ctx *ReplyContext)
	IsRequest() bool
}
