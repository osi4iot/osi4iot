package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"pipelines/logger"
)

const (
    ParseModeHTML       = "HTML"
    ParseModeMarkdownV2 = "MarkdownV2"
)

type TelegramSendMessage struct {
	ChatID    int64  `json:"chat_id"`
	Text      string `json:"text"`
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

type MessageOption func(*TelegramSendMessage)

func WithParseMode(mode string) MessageOption {
	return func(m *TelegramSendMessage) {
		m.ParseMode = mode
	}
}

func SendTelegramMessage(botToken string, chatID int64, message string, log *logger.Logger, opts ...MessageOption) error {
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
		return fmt.Errorf("error al crear JSON: %v", err)
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
