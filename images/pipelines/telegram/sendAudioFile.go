package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"pipelines/logger"
)

// SendTelegramAudioFile sends an audio clip with the Telegram method its
// format allows:
//
//   - MP3 and M4A (audio/mpeg, audio/mp4, audio/x-m4a): sendAudio, shown
//     with Telegram's audio player. Text2Speech produces MP3 and Safari
//     records M4A.
//   - OGG/Opus (audio/ogg, audio/opus): sendVoice, shown as a voice note.
//     Firefox records it.
//   - Anything else (audio/webm, recorded by Chrome and Edge; WAV...):
//     sendDocument. Telegram plays neither as audio, so it arrives as a
//     file that can be downloaded and played.
//
// The file name gets the extension of its format: Telegram uses it, and a
// clip received by a Listen node is named after the NATS subject.
func SendTelegramAudioFile(
	botToken string,
	chatID int64,
	audioData []byte,
	filename string,
	contentType string,
	caption string,
	log *logger.Logger,
) error {
	mediaType := audioMediaType(contentType)
	filename = audioFileName(filename, mediaType)

	switch mediaType {
	case "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a":
		opts := []AudioOption{}
		if caption != "" {
			opts = append(opts, WithAudioCaption(caption))
		}
		return SendTelegramAudio(botToken, chatID, audioData, filename, log, opts...)
	case "audio/ogg", "audio/opus":
		return sendTelegramFile(botToken, "sendVoice", "voice", chatID, audioData, filename, caption)
	default:
		log.Infof("Telegram: %s cannot be played as audio by Telegram, sending it as a file", mediaType)
		return sendTelegramFile(botToken, "sendDocument", "document", chatID, audioData, filename, caption)
	}
}

// audioMediaType: "audio/webm;codecs=opus" -> "audio/webm"
func audioMediaType(contentType string) string {
	mediaType, _, _ := strings.Cut(contentType, ";")
	return strings.ToLower(strings.TrimSpace(mediaType))
}

var audioExtensions = map[string]string{
	"audio/mpeg":  ".mp3",
	"audio/mp3":   ".mp3",
	"audio/mp4":   ".m4a",
	"audio/x-m4a": ".m4a",
	"audio/m4a":   ".m4a",
	"audio/ogg":   ".ogg",
	"audio/opus":  ".ogg",
	"audio/webm":  ".webm",
	"audio/wav":   ".wav",
	"audio/wave":  ".wav",
	"audio/x-wav": ".wav",
	"audio/flac":  ".flac",
}

func audioFileName(filename, mediaType string) string {
	ext, ok := audioExtensions[mediaType]
	if !ok {
		return filename
	}
	if strings.HasSuffix(strings.ToLower(filename), ext) {
		return filename
	}
	return "audio" + ext
}

// sendTelegramFile uploads a file with a Telegram method that takes it in
// the field fileField (sendVoice: "voice", sendDocument: "document").
func sendTelegramFile(
	botToken string,
	method string,
	fileField string,
	chatID int64,
	data []byte,
	filename string,
	caption string,
) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/%s", botToken, method)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("chat_id", fmt.Sprintf("%d", chatID)); err != nil {
		return fmt.Errorf("error writing chat_id: %v", err)
	}
	if caption != "" {
		if err := writer.WriteField("caption", caption); err != nil {
			return fmt.Errorf("error writing caption: %v", err)
		}
	}
	part, err := writer.CreateFormFile(fileField, filename)
	if err != nil {
		return fmt.Errorf("error creating form file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		return fmt.Errorf("error writing file data: %v", err)
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

	var telegramResp TelegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&telegramResp); err != nil {
		return fmt.Errorf("unexpected HTTP status %d: error decoding response: %v", resp.StatusCode, err)
	}
	if !telegramResp.Ok {
		return fmt.Errorf("telegram API error (code %d): %s", telegramResp.ErrorCode, telegramResp.Description)
	}
	return nil
}
