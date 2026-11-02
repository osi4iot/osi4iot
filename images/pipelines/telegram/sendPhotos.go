package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"time"
	"unicode/utf8"

	"pipelines/logger"
)

// PhotoUpload is an image to send with SendTelegramPhotos.
type PhotoUpload struct {
	Data     []byte
	FileName string
	Caption  string
}

// maxCaptionRunes is the longest caption Telegram takes.
const maxCaptionRunes = 1024

// telegramAPI is the Bot API server (a test server in the tests).
var telegramAPI = "https://api.telegram.org"

// maxMediaGroup is the most photos of an album (sendMediaGroup).
const maxMediaGroup = 10

// SendTelegramPhotos sends images to a chat: one alone as a photo, and
// several as albums (sendMediaGroup, up to 10 each), each with its
// caption.
func SendTelegramPhotos(botToken string, chatID int64, photos []PhotoUpload, log *logger.Logger) error {
	if len(photos) == 1 {
		p := photos[0]
		return SendTelegramPhoto(botToken, chatID, p.Data, p.FileName, log, WithCaption(captionText(p.Caption)))
	}
	for start := 0; start < len(photos); start += maxMediaGroup {
		end := min(start+maxMediaGroup, len(photos))
		group := photos[start:end]
		var err error
		if len(group) == 1 {
			err = SendTelegramPhoto(botToken, chatID, group[0].Data, group[0].FileName, log, WithCaption(captionText(group[0].Caption)))
		} else {
			err = sendMediaGroup(botToken, chatID, group)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func captionText(s string) string {
	if utf8.RuneCountInString(s) <= maxCaptionRunes {
		return s
	}
	r := []rune(s)
	return string(r[:maxCaptionRunes-1]) + "…"
}

type inputMediaPhoto struct {
	Type    string `json:"type"`
	Media   string `json:"media"`
	Caption string `json:"caption,omitempty"`
}

// sendMediaGroup sends 2 to 10 photos as an album: each file is a part of
// the form ("photo<i>"), referenced from "media" as attach://photo<i>.
func sendMediaGroup(botToken string, chatID int64, photos []PhotoUpload) error {
	apiURL := fmt.Sprintf("%s/bot%s/sendMediaGroup", telegramAPI, botToken)

	media := make([]inputMediaPhoto, len(photos))
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("chat_id", fmt.Sprintf("%d", chatID)); err != nil {
		return fmt.Errorf("error writing chat_id: %v", err)
	}
	for i, p := range photos {
		field := fmt.Sprintf("photo%d", i)
		media[i] = inputMediaPhoto{Type: "photo", Media: "attach://" + field, Caption: captionText(p.Caption)}
		part, err := writer.CreateFormFile(field, p.FileName)
		if err != nil {
			return fmt.Errorf("error creating form file: %v", err)
		}
		if _, err := part.Write(p.Data); err != nil {
			return fmt.Errorf("error writing photo data: %v", err)
		}
	}
	mediaJSON, err := json.Marshal(media)
	if err != nil {
		return fmt.Errorf("error creating media JSON: %v", err)
	}
	if err := writer.WriteField("media", string(mediaJSON)); err != nil {
		return fmt.Errorf("error writing media: %v", err)
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

	var telegramResp struct {
		Ok          bool   `json:"ok"`
		Description string `json:"description"`
		ErrorCode   int    `json:"error_code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("unexpected HTTP status %d: error decoding response: %v", resp.StatusCode, err)
	}
	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}
	return nil
}
