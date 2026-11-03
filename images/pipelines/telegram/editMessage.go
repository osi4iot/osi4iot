package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// postTelegram calls a method of the Bot API and decodes its answer.
func postTelegram(botToken, method string, payload any, result any) error {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error creating JSON: %v", err)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(fmt.Sprintf("https://api.telegram.org/bot%s/%s", botToken, method), "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()
	var answer struct {
		Ok          bool            `json:"ok"`
		Description string          `json:"description"`
		ErrorCode   int             `json:"error_code"`
		Result      json.RawMessage `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&answer); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}
	if !answer.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", answer.ErrorCode, answer.Description)
	}
	if result != nil {
		return json.Unmarshal(answer.Result, result)
	}
	return nil
}

// SendTelegramMessageWithID sends a message and returns its id (to edit it
// later, e.g. to show the decision on an approval request).
func SendTelegramMessageWithID(botToken string, chatID int64, message string, opts ...MessageOption) (int64, error) {
	payload := TelegramSendMessage{ChatID: chatID, Text: message}
	for _, opt := range opts {
		opt(&payload)
	}
	var sent struct {
		MessageID int64 `json:"message_id"`
	}
	if err := postTelegram(botToken, "sendMessage", payload, &sent); err != nil {
		return 0, err
	}
	return sent.MessageID, nil
}

// EditTelegramMessageText replaces the text of a message the bot sent; its
// inline buttons go away unless opts give new ones.
func EditTelegramMessageText(botToken string, chatID, messageID int64, text string, opts ...MessageOption) error {
	message := TelegramSendMessage{ChatID: chatID, Text: text}
	for _, opt := range opts {
		opt(&message)
	}
	payload := struct {
		TelegramSendMessage
		MessageID int64 `json:"message_id"`
	}{message, messageID}
	return postTelegram(botToken, "editMessageText", payload, nil)
}
