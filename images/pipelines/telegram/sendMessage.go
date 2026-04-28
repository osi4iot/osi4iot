package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"time"

	"pipelines/logger"
)

const (
	ParseModeHTML       = "HTML"
	ParseModeMarkdownV2 = "MarkdownV2"
)

type TelegramSendMessage struct {
	ChatID      int64                 `json:"chat_id"`
	Text        string                `json:"text"`
	ParseMode   string                `json:"parse_mode,omitempty"`
	ReplyMarkup *InlineKeyboardMarkup `json:"reply_markup,omitempty"`
}

type TelegramSendPhoto struct {
	ChatID    int64  `json:"chat_id"`
	Caption   string `json:"caption,omitempty"`
	ParseMode string `json:"parse_mode,omitempty"`
}

type TelegramResponse struct {
	Ok          bool   `json:"ok"`
	Description string `json:"description"`
	ErrorCode   int    `json:"error_code"`
	Result      struct {
		MessageID int    `json:"message_id"`
		Date      int    `json:"date"`
		Text      string `json:"text"`
	} `json:"result"`
}

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

type MessageOption func(*TelegramSendMessage)

func WithParseMode(mode string) MessageOption {
	return func(m *TelegramSendMessage) {
		m.ParseMode = mode
	}
}

type PhotoOption func(*TelegramSendPhoto)

func WithCaption(caption string) PhotoOption {
	return func(p *TelegramSendPhoto) {
		p.Caption = caption
	}
}

func WithPhotoParseMode(mode string) PhotoOption {
	return func(p *TelegramSendPhoto) {
		p.ParseMode = mode
	}
}

func WithInlineKeyboard(rows [][]InlineKeyboardButton) MessageOption {
	return func(m *TelegramSendMessage) {
		m.ReplyMarkup = &InlineKeyboardMarkup{InlineKeyboard: rows}
	}
}

func SendTelegramMessage(
	botToken string,
	chatID int64,
	message string,
	log *logger.Logger,
	opts ...MessageOption,
) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)

	payload := TelegramSendMessage{
		ChatID: chatID,
		Text:   message,
	}

	for _, opt := range opts {
		opt(&payload)
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error creating JSON: %v", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}

	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}

	return nil
}

func SendTelegramPhoto(
	botToken string,
	chatID int64,
	imgData []byte,
	filename string,
	log *logger.Logger,
	opts ...PhotoOption,
) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", botToken)

	payload := TelegramSendPhoto{
		ChatID: chatID,
	}
	for _, opt := range opts {
		opt(&payload)
	}

	// Construir multipart/form-data
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// chat_id
	if err := writer.WriteField("chat_id", fmt.Sprintf("%d", payload.ChatID)); err != nil {
		return fmt.Errorf("error writing chat_id: %v", err)
	}

	// caption (opcional)
	if payload.Caption != "" {
		if err := writer.WriteField("caption", payload.Caption); err != nil {
			return fmt.Errorf("error writing caption: %v", err)
		}
	}

	// parse_mode (opcional)
	if payload.ParseMode != "" {
		if err := writer.WriteField("parse_mode", payload.ParseMode); err != nil {
			return fmt.Errorf("error writing parse_mode: %v", err)
		}
	}

	// foto
	part, err := writer.CreateFormFile("photo", filename)
	if err != nil {
		return fmt.Errorf("error creating form file: %v", err)
	}
	if _, err := part.Write(imgData); err != nil {
		return fmt.Errorf("error writing image data: %v", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("error closing multipart writer: %v", err)
	}

	// Enviar request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(apiURL, writer.FormDataContentType(), &body)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}

	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}

	return nil
}

type TelegramSendAudio struct {
	ChatID    int64  `json:"chat_id"`
	Caption   string `json:"caption,omitempty"`
	ParseMode string `json:"parse_mode,omitempty"`
	Title     string `json:"title,omitempty"`
	Performer string `json:"performer,omitempty"`
}

type AudioOption func(*TelegramSendAudio)

func WithAudioCaption(caption string) AudioOption {
	return func(a *TelegramSendAudio) {
		a.Caption = caption
	}
}

func WithAudioParseMode(mode string) AudioOption {
	return func(a *TelegramSendAudio) {
		a.ParseMode = mode
	}
}

func WithAudioTitle(title string) AudioOption {
	return func(a *TelegramSendAudio) {
		a.Title = title
	}
}

func WithAudioPerformer(performer string) AudioOption {
	return func(a *TelegramSendAudio) {
		a.Performer = performer
	}
}

func SendTelegramAudio(
	botToken string,
	chatID int64,
	audioData []byte,
	filename string,
	log *logger.Logger,
	opts ...AudioOption,
) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendAudio", botToken)

	payload := TelegramSendAudio{
		ChatID: chatID,
	}
	for _, opt := range opts {
		opt(&payload)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("chat_id", fmt.Sprintf("%d", payload.ChatID)); err != nil {
		return fmt.Errorf("error writing chat_id: %v", err)
	}
	if payload.Caption != "" {
		if err := writer.WriteField("caption", payload.Caption); err != nil {
			return fmt.Errorf("error writing caption: %v", err)
		}
	}
	if payload.ParseMode != "" {
		if err := writer.WriteField("parse_mode", payload.ParseMode); err != nil {
			return fmt.Errorf("error writing parse_mode: %v", err)
		}
	}
	if payload.Title != "" {
		if err := writer.WriteField("title", payload.Title); err != nil {
			return fmt.Errorf("error writing title: %v", err)
		}
	}
	if payload.Performer != "" {
		if err := writer.WriteField("performer", payload.Performer); err != nil {
			return fmt.Errorf("error writing performer: %v", err)
		}
	}

	part, err := writer.CreateFormFile("audio", filename)
	if err != nil {
		return fmt.Errorf("error creating form file: %v", err)
	}
	if _, err := part.Write(audioData); err != nil {
		return fmt.Errorf("error writing audio data: %v", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("error closing multipart writer: %v", err)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Post(apiURL, writer.FormDataContentType(), &body)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}
	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}

	return nil
}

func AnswerCallbackQuery(botToken, callbackQueryID string, text string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", botToken)

	payload := struct {
		CallbackQueryID string `json:"callback_query_id"`
		Text            string `json:"text,omitempty"`
	}{
		CallbackQueryID: callbackQueryID,
		Text:            text,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error creating JSON: %v", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}
	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}
	return nil
}