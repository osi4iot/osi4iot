package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

const (
	defaultPollTimeout  = 30 * time.Second
	defaultErrorTimeout = 5 * time.Second
	maxErrorTimeout     = 60 * time.Second
	telegramAPIBaseURL  = "https://api.telegram.org/bot"
)

// Poller realiza long polling a la API de Telegram
type Poller struct {
	token        string
	pollTimeout  time.Duration
	lastUpdateID atomic.Int64
	httpClient   *http.Client
	messages     chan *TelegramMessage
	debug        bool
	onError      func(error)
}

// PollerOption configura el Poller
type PollerOption func(*Poller)

// WithPollTimeout configura el timeout de long polling
func WithPollTimeout(d time.Duration) PollerOption {
	return func(p *Poller) {
		p.pollTimeout = d
	}
}

// WithDebug habilita logging de debug
func WithDebug(debug bool) PollerOption {
	return func(p *Poller) {
		p.debug = debug
	}
}

// WithErrorHandler configura un handler para errores
func WithErrorHandler(handler func(error)) PollerOption {
	return func(p *Poller) {
		p.onError = handler
	}
}

// WithChannelBuffer configura el tamaño del buffer del channel de mensajes
func WithChannelBuffer(size int) PollerOption {
	return func(p *Poller) {
		p.messages = make(chan *TelegramMessage, size)
	}
}

// NewPoller crea un nuevo Poller
func NewPoller(token string, opts ...PollerOption) *Poller {
	p := &Poller{
		token:       token,
		pollTimeout: defaultPollTimeout,
		messages:    make(chan *TelegramMessage, 100),
		httpClient: &http.Client{
			Timeout: defaultPollTimeout + 5*time.Second, // Margen extra
		},
		onError: func(err error) {}, // No-op por defecto
	}

	for _, opt := range opts {
		opt(p)
	}

	return p
}

// Messages retorna el channel de mensajes
func (p *Poller) Messages() <-chan *TelegramMessage {
	return p.messages
}

// Start inicia el long polling. Bloquea hasta que el contexto se cancele.
func (p *Poller) Start(ctx context.Context) error {
	var errorTimeout time.Duration

	for {
		select {
		case <-ctx.Done():
			close(p.messages)
			return ctx.Err()
		default:
		}

		// Backoff después de error
		if errorTimeout > 0 {
			p.debugf("waiting %v after error", errorTimeout)
			select {
			case <-ctx.Done():
				close(p.messages)
				return ctx.Err()
			case <-time.After(errorTimeout):
			}
		}

		updates, err := p.getUpdates(ctx)
		if err != nil {
			if ctx.Err() != nil {
				close(p.messages)
				return ctx.Err()
			}
			p.onError(err)
			errorTimeout = p.increaseErrorTimeout(errorTimeout)
			continue
		}

		errorTimeout = 0

		for _, upd := range updates {
			msg := p.convertUpdate(upd)
			if msg == nil {
				continue
			}

			p.lastUpdateID.Store(upd.UpdateID)

			select {
			case <-ctx.Done():
				close(p.messages)
				return ctx.Err()
			case p.messages <- msg:
			}
		}
	}
}

func (p *Poller) getUpdates(ctx context.Context) ([]update, error) {
	offset := p.lastUpdateID.Load() + 1
	timeout := int((p.pollTimeout - time.Second).Seconds())

	url := fmt.Sprintf("%s%s/getUpdates?offset=%d&timeout=%d",
		telegramAPIBaseURL, p.token, offset, timeout)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	var apiResp apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	if !apiResp.OK {
		return nil, fmt.Errorf("telegram API error %d: %s", apiResp.ErrorCode, apiResp.Description)
	}

	return apiResp.Result, nil
}

func (p *Poller) convertUpdate(upd update) *TelegramMessage {
	if upd.Message == nil {
		return nil
	}

	if upd.Message.From != nil && upd.Message.From.IsBot {
		return nil
	}

	msg := upd.Message
	tm := &TelegramMessage{
		UpdateID:  upd.UpdateID,
		MessageID: msg.MessageID,
		ChatID:    msg.Chat.ID,
		ChatType:  msg.Chat.Type,
		ChatTitle: msg.Chat.Title,
		Timestamp: time.Unix(msg.Date, 0),
		Caption:   msg.Caption,
	}

	// Info del usuario
	if msg.From != nil {
		tm.UserID = msg.From.ID
		tm.Username = msg.From.Username
		tm.FirstName = msg.From.FirstName
		tm.LastName = msg.From.LastName
	}

	// Reply
	if msg.ReplyToMessage != nil {
		tm.ReplyToMessageID = msg.ReplyToMessage.MessageID
	}

	// Forward
	if msg.ForwardFrom != nil {
		tm.ForwardFrom = &User{
			ID:        msg.ForwardFrom.ID,
			IsBot:     msg.ForwardFrom.IsBot,
			FirstName: msg.ForwardFrom.FirstName,
			LastName:  msg.ForwardFrom.LastName,
			Username:  msg.ForwardFrom.Username,
		}
	}

	// Entities
	if len(msg.Entities) > 0 {
		tm.Entities = make([]Entity, len(msg.Entities))
		for i, e := range msg.Entities {
			tm.Entities[i] = Entity{
				Type:   e.Type,
				Offset: e.Offset,
				Length: e.Length,
				URL:    e.URL,
			}
			if e.User != nil {
				tm.Entities[i].User = &User{
					ID:        e.User.ID,
					IsBot:     e.User.IsBot,
					FirstName: e.User.FirstName,
					LastName:  e.User.LastName,
					Username:  e.User.Username,
				}
			}
		}
	}

	// Determinar tipo y contenido
	switch {
	case msg.Text != "":
		tm.Type = MessageTypeText
		tm.Text = msg.Text

	case len(msg.Photo) > 0:
		tm.Type = MessageTypePhoto
		// Tomar la foto de mayor resolución (última del array)
		photo := msg.Photo[len(msg.Photo)-1]
		tm.Photo = &Photo{
			FileID:       photo.FileID,
			FileUniqueID: photo.FileUniqueID,
			Width:        photo.Width,
			Height:       photo.Height,
			FileSize:     photo.FileSize,
		}

	case msg.Video != nil:
		tm.Type = MessageTypeVideo
		tm.Video = &Video{
			FileID:       msg.Video.FileID,
			FileUniqueID: msg.Video.FileUniqueID,
			Width:        msg.Video.Width,
			Height:       msg.Video.Height,
			Duration:     msg.Video.Duration,
			MimeType:     msg.Video.MimeType,
			FileSize:     msg.Video.FileSize,
		}
		if msg.Video.Thumbnail != nil {
			tm.Video.Thumbnail = &Photo{
				FileID:       msg.Video.Thumbnail.FileID,
				FileUniqueID: msg.Video.Thumbnail.FileUniqueID,
				Width:        msg.Video.Thumbnail.Width,
				Height:       msg.Video.Thumbnail.Height,
				FileSize:     msg.Video.Thumbnail.FileSize,
			}
		}

	case msg.Audio != nil:
		tm.Type = MessageTypeAudio
		tm.Audio = &Audio{
			FileID:       msg.Audio.FileID,
			FileUniqueID: msg.Audio.FileUniqueID,
			Duration:     msg.Audio.Duration,
			Performer:    msg.Audio.Performer,
			Title:        msg.Audio.Title,
			MimeType:     msg.Audio.MimeType,
			FileSize:     msg.Audio.FileSize,
		}

	case msg.Voice != nil:
		tm.Type = MessageTypeVoice
		tm.Voice = &Voice{
			FileID:       msg.Voice.FileID,
			FileUniqueID: msg.Voice.FileUniqueID,
			Duration:     msg.Voice.Duration,
			MimeType:     msg.Voice.MimeType,
			FileSize:     msg.Voice.FileSize,
		}

	case msg.Document != nil:
		tm.Type = MessageTypeDocument
		tm.Document = &Document{
			FileID:       msg.Document.FileID,
			FileUniqueID: msg.Document.FileUniqueID,
			FileName:     msg.Document.FileName,
			MimeType:     msg.Document.MimeType,
			FileSize:     msg.Document.FileSize,
		}
		if msg.Document.Thumbnail != nil {
			tm.Document.Thumbnail = &Photo{
				FileID:       msg.Document.Thumbnail.FileID,
				FileUniqueID: msg.Document.Thumbnail.FileUniqueID,
				Width:        msg.Document.Thumbnail.Width,
				Height:       msg.Document.Thumbnail.Height,
				FileSize:     msg.Document.Thumbnail.FileSize,
			}
		}

	case msg.Sticker != nil:
		tm.Type = MessageTypeSticker
		tm.Sticker = &Sticker{
			FileID:       msg.Sticker.FileID,
			FileUniqueID: msg.Sticker.FileUniqueID,
			Type:         msg.Sticker.Type,
			Width:        msg.Sticker.Width,
			Height:       msg.Sticker.Height,
			IsAnimated:   msg.Sticker.IsAnimated,
			IsVideo:      msg.Sticker.IsVideo,
			Emoji:        msg.Sticker.Emoji,
			SetName:      msg.Sticker.SetName,
		}

	case msg.Location != nil:
		tm.Type = MessageTypeLocation
		tm.Location = &Location{
			Latitude:  msg.Location.Latitude,
			Longitude: msg.Location.Longitude,
			Accuracy:  msg.Location.HorizontalAccuracy,
		}

	case msg.Contact != nil:
		tm.Type = MessageTypeContact
		tm.Contact = &Contact{
			PhoneNumber: msg.Contact.PhoneNumber,
			FirstName:   msg.Contact.FirstName,
			LastName:    msg.Contact.LastName,
			UserID:      msg.Contact.UserID,
			Vcard:       msg.Contact.Vcard,
		}

	case msg.Poll != nil:
		tm.Type = MessageTypePoll
		tm.Poll = &Poll{
			ID:       msg.Poll.ID,
			Question: msg.Poll.Question,
			IsClosed: msg.Poll.IsClosed,
			Type:     msg.Poll.Type,
		}
		tm.Poll.Options = make([]PollOption, len(msg.Poll.Options))
		for i, opt := range msg.Poll.Options {
			tm.Poll.Options[i] = PollOption{
				Text:       opt.Text,
				VoterCount: opt.VoterCount,
			}
		}

	default:
		tm.Type = MessageTypeUnknown
	}

	return tm
}

func (p *Poller) increaseErrorTimeout(current time.Duration) time.Duration {
	if current == 0 {
		return defaultErrorTimeout
	}
	next := current * 2
	if next > maxErrorTimeout {
		return maxErrorTimeout
	}
	return next
}

func (p *Poller) debugf(format string, args ...any) {
	if p.debug {
		fmt.Printf("[telegram-poller] "+format+"\n", args...)
	}
}
