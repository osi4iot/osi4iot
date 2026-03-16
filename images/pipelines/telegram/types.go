package telegram

import "time"

// TelegramMessage representa un mensaje recibido de Telegram
type TelegramMessage struct {
	UpdateID  int64     `json:"update_id"`
	MessageID int64     `json:"message_id"`
	ChatID    int64     `json:"chat_id"`
	ChatType  string    `json:"chat_type"` // "private", "group", "supergroup", "channel"
	ChatTitle string    `json:"chat_title,omitempty"`
	UserID    int64     `json:"user_id,omitempty"`
	Username  string    `json:"username,omitempty"`
	FirstName string    `json:"first_name,omitempty"`
	LastName  string    `json:"last_name,omitempty"`
	Timestamp time.Time `json:"timestamp"`

	// Tipo de contenido
	Type MessageType `json:"type"`

	// Contenido según el tipo
	Text     string    `json:"text,omitempty"`
	Caption  string    `json:"caption,omitempty"`
	Photo    *Photo    `json:"photo,omitempty"`
	Video    *Video    `json:"video,omitempty"`
	Audio    *Audio    `json:"audio,omitempty"`
	Voice    *Voice    `json:"voice,omitempty"`
	Document *Document `json:"document,omitempty"`
	Sticker  *Sticker  `json:"sticker,omitempty"`
	Location *Location `json:"location,omitempty"`
	Contact  *Contact  `json:"contact,omitempty"`
	Poll     *Poll     `json:"poll,omitempty"`

	// Metadata adicional
	ReplyToMessageID int64    `json:"reply_to_message_id,omitempty"`
	ForwardFrom      *User    `json:"forward_from,omitempty"`
	Entities         []Entity `json:"entities,omitempty"`

	IsEdited bool `json:"is_edited,omitempty"`

	CallbackQueryID string `json:"callback_query_id,omitempty"`
	CallbackData    string `json:"callback_data,omitempty"`
}

type MessageType string

const (
	MessageTypeText     MessageType = "text"
	MessageTypePhoto    MessageType = "photo"
	MessageTypeVideo    MessageType = "video"
	MessageTypeAudio    MessageType = "audio"
	MessageTypeVoice    MessageType = "voice"
	MessageTypeDocument MessageType = "document"
	MessageTypeSticker  MessageType = "sticker"
	MessageTypeLocation MessageType = "location"
	MessageTypeContact  MessageType = "contact"
	MessageTypePoll     MessageType = "poll"
	MessageTypeCallback MessageType = "callback_query"
	MessageTypeUnknown  MessageType = "unknown"
)

type Photo struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type Video struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Duration     int    `json:"duration"`
	Thumbnail    *Photo `json:"thumbnail,omitempty"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type Audio struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	Performer    string `json:"performer,omitempty"`
	Title        string `json:"title,omitempty"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type Voice struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type Document struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Thumbnail    *Photo `json:"thumbnail,omitempty"`
	FileName     string `json:"file_name,omitempty"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type Sticker struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Type         string `json:"type"` // "regular", "mask", "custom_emoji"
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	IsAnimated   bool   `json:"is_animated"`
	IsVideo      bool   `json:"is_video"`
	Emoji        string `json:"emoji,omitempty"`
	SetName      string `json:"set_name,omitempty"`
}

type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Accuracy  float64 `json:"horizontal_accuracy,omitempty"`
}

type Contact struct {
	PhoneNumber string `json:"phone_number"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name,omitempty"`
	UserID      int64  `json:"user_id,omitempty"`
	Vcard       string `json:"vcard,omitempty"`
}

type Poll struct {
	ID       string       `json:"id"`
	Question string       `json:"question"`
	Options  []PollOption `json:"options"`
	IsClosed bool         `json:"is_closed"`
	Type     string       `json:"type"` // "regular", "quiz"
}

type PollOption struct {
	Text       string `json:"text"`
	VoterCount int    `json:"voter_count"`
}

type CallbackQuery struct {
	ID     string `json:"id"`
	Data   string `json:"data"`
	UserID int64  `json:"user_id"`
	ChatID int64  `json:"chat_id"`
}

type User struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username,omitempty"`
}

type Entity struct {
	Type   string `json:"type"` // "mention", "hashtag", "url", "bold", "italic", etc.
	Offset int    `json:"offset"`
	Length int    `json:"length"`
	URL    string `json:"url,omitempty"`
	User   *User  `json:"user,omitempty"`
}

type apiResponse struct {
	OK          bool     `json:"ok"`
	Result      []update `json:"result,omitempty"`
	Description string   `json:"description,omitempty"`
	ErrorCode   int      `json:"error_code,omitempty"`
}

type callbackQuery struct {
	ID      string `json:"id"`
	From    user   `json:"from"`
	Message struct {
		MessageID int64 `json:"message_id"`
		Chat      chat  `json:"chat"`
	} `json:"message"`
	Data string `json:"data"`
}

type update struct {
	UpdateID      int64          `json:"update_id"`
	Message       *message       `json:"message,omitempty"`
	EditedMessage *message       `json:"edited_message"`
	CallbackQuery *callbackQuery `json:"callback_query,omitempty"`
}

type message struct {
	MessageID int64  `json:"message_id"`
	From      *user  `json:"from,omitempty"`
	Chat      chat   `json:"chat"`
	Date      int64  `json:"date"`
	Text      string `json:"text,omitempty"`
	Caption   string `json:"caption,omitempty"`

	// Tipos de contenido
	Photo    []photoSize `json:"photo,omitempty"`
	Video    *video      `json:"video,omitempty"`
	Audio    *audio      `json:"audio,omitempty"`
	Voice    *voice      `json:"voice,omitempty"`
	Document *document   `json:"document,omitempty"`
	Sticker  *sticker    `json:"sticker,omitempty"`
	Location *location   `json:"location,omitempty"`
	Contact  *contact    `json:"contact,omitempty"`
	Poll     *poll       `json:"poll,omitempty"`

	// Metadata
	ReplyToMessage *message `json:"reply_to_message,omitempty"`
	ForwardFrom    *user    `json:"forward_from,omitempty"`
	Entities       []entity `json:"entities,omitempty"`
}

type chat struct {
	ID    int64  `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title,omitempty"`
}

type user struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username,omitempty"`
}

type photoSize struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type video struct {
	FileID       string     `json:"file_id"`
	FileUniqueID string     `json:"file_unique_id"`
	Width        int        `json:"width"`
	Height       int        `json:"height"`
	Duration     int        `json:"duration"`
	Thumbnail    *photoSize `json:"thumbnail,omitempty"`
	MimeType     string     `json:"mime_type,omitempty"`
	FileSize     int64      `json:"file_size,omitempty"`
}

type audio struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	Performer    string `json:"performer,omitempty"`
	Title        string `json:"title,omitempty"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type voice struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Duration     int    `json:"duration"`
	MimeType     string `json:"mime_type,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
}

type document struct {
	FileID       string     `json:"file_id"`
	FileUniqueID string     `json:"file_unique_id"`
	Thumbnail    *photoSize `json:"thumbnail,omitempty"`
	FileName     string     `json:"file_name,omitempty"`
	MimeType     string     `json:"mime_type,omitempty"`
	FileSize     int64      `json:"file_size,omitempty"`
}

type sticker struct {
	FileID       string `json:"file_id"`
	FileUniqueID string `json:"file_unique_id"`
	Type         string `json:"type"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	IsAnimated   bool   `json:"is_animated"`
	IsVideo      bool   `json:"is_video"`
	Emoji        string `json:"emoji,omitempty"`
	SetName      string `json:"set_name,omitempty"`
}

type location struct {
	Latitude           float64 `json:"latitude"`
	Longitude          float64 `json:"longitude"`
	HorizontalAccuracy float64 `json:"horizontal_accuracy,omitempty"`
}

type contact struct {
	PhoneNumber string `json:"phone_number"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name,omitempty"`
	UserID      int64  `json:"user_id,omitempty"`
	Vcard       string `json:"vcard,omitempty"`
}

type poll struct {
	ID       string       `json:"id"`
	Question string       `json:"question"`
	Options  []pollOption `json:"options"`
	IsClosed bool         `json:"is_closed"`
	Type     string       `json:"type"`
}

type pollOption struct {
	Text       string `json:"text"`
	VoterCount int    `json:"voter_count"`
}

type entity struct {
	Type   string `json:"type"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
	URL    string `json:"url,omitempty"`
	User   *user  `json:"user,omitempty"`
}
