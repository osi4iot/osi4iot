package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"pipelines/logger"
)


type TelegramMessage struct {
	ChatID int64  `json:"chat_id"`
	Text   string `json:"text"`
}


type TelegramResponse struct {
	Ok     bool `json:"ok"`
	Result struct {
		MessageID int    `json:"message_id"`
		Date      int    `json:"date"`
		Text      string `json:"text"`
	} `json:"result"`
}

func SendTelegramMessage(botToken string, chatID int64, message string, log *logger.Logger) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	
	payload := TelegramMessage{
		ChatID: chatID,
		Text:   message,
	}
	
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error al crear JSON: %v", err)
	}
	
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()
	

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("error decoding response: %v", err)
	}
	
	if !telegramResp.Ok {
		return fmt.Errorf("error from Telegram API: %s", telegramResp.Result.Text)
	}

	log.Infof("Message sent successfully. ID: %d\n", telegramResp.Result.MessageID)
	return nil
}

