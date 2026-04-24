package message

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"maps"
	"pipelines/common"
)

type Message struct {
	Topic         string               `json:"topic"`
	Payload       map[string]any       `json:"payload"`
	State         map[string]any       `json:"state"`
	ContentType   string               `json:"content_type,omitempty"`
	JsonStructure string               `json:"json_structure,omitempty"`
	File          *common.File         `json:"file,omitempty"`
	ReplySubject  string               `json:"reply_subject,omitempty"`
	ReplyContext  *common.ReplyContext `json:"reply_context,omitempty"`
}

const (
	DefaultContentType   = "application/json"
	DefaultJsonStructure = "object"
)

func NewMessage(topic string, payload map[string]any, state map[string]any, contentType string, file *common.File) *Message {
	if contentType == "" {
		contentType = DefaultContentType
	}
	return &Message{
		Topic:         topic,
		Payload:       payload,
		State:         state,
		ContentType:   contentType,
		JsonStructure: DefaultJsonStructure,
		File:          file,
	}
}

func NewMessageFromPayload(payload map[string]any) *Message {
	return &Message{
		Payload:       payload,
		ContentType:   DefaultContentType,
		JsonStructure: DefaultJsonStructure,
	}
}

// GetTopic returns the topic of the message
func (m *Message) GetTopic() string {
	return m.Topic
}

// GetPayload returns the payload of the message
func (m *Message) GetPayload() map[string]any {
	return m.Payload
}

// GetState returns the state of the message
func (m *Message) GetState() map[string]any {
	return m.State
}

// GetContentType returns the content type of the attached file
func (m *Message) GetContentType() string {
	contentType := m.ContentType
	if contentType == "" {
		contentType = DefaultContentType
	}
	return contentType
}

// GetFile returns the attached file of the message
func (m *Message) GetFile() *common.File {
	return m.File
}

// GetFieldFromPayload retrieves a specific field from the payload
func (m *Message) GetFieldFromPayload(field string) (any, bool) {
	value, exists := m.Payload[field]
	return value, exists
}

// GetStringFromPayload retrieves a string field from the payload
func (m *Message) GetStringFromPayload(field string) (string, bool) {
	value, exists := m.Payload[field]
	if !exists {
		return "", false
	}
	str, ok := value.(string)
	return str, ok
}

// GetMapFromPayload retrieves a map[string]any field from the payload
func (m *Message) GetMapFromPayload(field string) (map[string]any, bool) {
	value, exists := m.Payload[field]
	if !exists {
		return nil, false
	}
	result, ok := value.(map[string]any)
	return result, ok
}

// SetImage attaches an image.Image to the message
func (m *Message) SetImage(img image.Image, name string, contentType string) error {
	buf := new(bytes.Buffer)
	switch contentType {
	case "image/png":
		if err := png.Encode(buf, img); err != nil {
			return fmt.Errorf("error encoding PNG: %w", err)
		}
	case "image/jpeg", "image/jpg":
		if err := jpeg.Encode(buf, img, nil); err != nil {
			return fmt.Errorf("error encoding JPEG: %w", err)
		}
	case "image/gif":
		if err := gif.Encode(buf, img, nil); err != nil {
			return fmt.Errorf("error encoding GIF: %w", err)
		}
	default:
		return fmt.Errorf("unsupported content type: %s", contentType)
	}

	m.File = &common.File{
		Name:        name,
		ContentType: contentType,
		Data:        buf.Bytes(),
		Image:       img,
	}
	return nil
}

// GetImage gets the image.Image from the message
func (m *Message) GetImage() (image.Image, error) {
	if m.File == nil {
		return nil, fmt.Errorf("message has no file attached")
	}
	// Si ya está cacheada, devuelve directamente
	if m.File.Image != nil {
		return m.File.Image, nil
	}
	// Solo decodifica si viene de NATS (bytes crudos sin cache)
	img, _, err := image.Decode(bytes.NewReader(m.File.Data))
	if err != nil {
		return nil, fmt.Errorf("error decoding image: %w", err)
	}
	m.File.Image = img // cachea para llamadas futuras
	return img, nil
}

// HasFile checks if the message has an attached file
func (m *Message) HasFile() bool {
	return m.File != nil
}

// IsImage checks if the attached file is an image
func (m *Message) IsImage() bool {
	if m.File == nil {
		return false
	}
	switch m.File.ContentType {
	case "image/png", "image/jpeg", "image/jpg", "image/gif":
		return true
	}
	return false
}

// IsAudio checks if the attached file is an audio file
func (m *Message) IsAudio() bool {
	if m.File == nil {
		return false
	}
	switch m.File.ContentType {
	case "audio/wav", "audio/wave", "audio/x-wav",
		"audio/mp3", "audio/mpeg",
		"audio/ogg", "audio/flac":
		return true
	}
	return false
}

// GetJsonStructure returns the JSON structure of the message
func (m *Message) GetJsonStructure() string {
	jsonStructure := m.JsonStructure
	if jsonStructure == "" {
		jsonStructure = DefaultJsonStructure
	}
	return jsonStructure
}

// Clone creates a deep copy of the message
func (m *Message) Clone() common.Message {
	newPayload := make(map[string]any, len(m.Payload))
	maps.Copy(newPayload, m.Payload)

	var fileCopy *common.File
	if m.File != nil {
		dataCopy := make([]byte, len(m.File.Data))
		copy(dataCopy, m.File.Data)
		fileCopy = &common.File{
			Name:        m.File.Name,
			ContentType: m.File.ContentType,
			Data:        dataCopy,
			Image:       m.File.Image, // image.Image es inmutable, compartir la referencia es seguro
		}
	}

	return &Message{
		Topic:         m.Topic,
		Payload:       newPayload,
		State:         m.State,
		ContentType:   m.ContentType,
		JsonStructure: m.JsonStructure,
		File:          fileCopy,
        ReplyContext: m.ReplyContext,
	}
}

func (m *Message) ClearFile() {
	m.File = nil
}

func (m *Message) SetReplySubject(subject string) {
	m.ReplySubject = subject
}

func (m *Message) IsRequest() bool {
	return m.ReplyContext != nil && m.ReplyContext.Subject != ""
}

func (m *Message) GetReplyContext() *common.ReplyContext {
	return m.ReplyContext
}

func (m *Message) SetReplyContext(ctx *common.ReplyContext) {
	m.ReplyContext = ctx
}
