package nodes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
)

const (
	openAIWhisperURL   = "https://api.openai.com/v1/audio/transcriptions"
	openAITranslateURL = "https://api.openai.com/v1/audio/translations"
	whisperModel       = "gpt-4o-mini-transcribe"
)

type TranscriptorNode struct {
	BaseNode
	Translate           bool
	Language            string
	TranslationLanguage string
	APIKey              string
	httpClient          *http.Client
}

func CreateTranscriptorNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TranscriptorNode, error) {
	orgId := p.GetOrgId()
	providerUrl := fm.GetOrgLlmProviderUrl(orgId)
	providerApiKey := fm.GetOrgLlmProviderApiKey(orgId)
	groupId := p.GetGroupId()
	orgLlmEnabled := fm.GetOrgLlmEnabled(orgId)
	groupLlmEnabled := fm.GetGroupLlmEnabled(groupId)

	if !(orgLlmEnabled && groupLlmEnabled) {
		fm.Log().Errorf("AI Agent Node %s: LLM functionality is not enabled for the organization or group", node.NodeUid)
		return nil, fmt.Errorf("LLM functionality is not enabled for the organization or group")
	}

	if providerUrl != "https://api.openai.com/v1" {
		fm.Log().Errorf("AI Agent Node %s: LLM provider must be OpenAI", node.NodeUid)
		return nil, fmt.Errorf("LLM provider URL must be configured")
	}

	if providerApiKey == "" {
		fm.Log().Errorf("AI Agent Node %s: API key must be configured", node.NodeUid)
		return nil, fmt.Errorf("API key must be configured")
	}

	language := "en"
	translate := false
	language, _ = node.Settings["language"].(string)
	translate, _ = node.Settings["translate"].(bool)

	translationLanguage := "English"
	translationLanguage, _ = node.Settings["translationLanguage"].(string)

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &TranscriptorNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Transcriptor",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		Translate:  translate,
		Language:   language,
		TranslationLanguage: translationLanguage,
		APIKey:     providerApiKey,
		httpClient: &http.Client{},
	}, nil
}

func (n *TranscriptorNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TranscriptorNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TranscriptorNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *TranscriptorNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("Node %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()
	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *TranscriptorNode) processMessage(msg common.Message, log *logger.Logger) error {
	if !msg.HasFile() || !msg.IsAudio() {
		log.Infof("TranscriptorNode %s: no audio file detected, forwarding message downstream", n.NodeUid)
		n.sendToOutputs(msg, log)
		return nil
	}

	file := msg.GetFile()
	log.Infof("TranscriptorNode %s: transcribing file '%s' (%s)", n.NodeUid, file.Name, file.ContentType)

	transcription, err := n.callWhisperAPI(n.Ctx, file.Data, file.Name, file.ContentType, log)
	if err != nil {
		log.Errorf("TranscriptorNode %s: failed to transcribe audio: %v", n.NodeUid, err)
		return fmt.Errorf("failed to transcribe audio: %w", err)
	}

	payload := map[string]any{
		"message":  transcription,
	}

	if n.Translate {
		translatedText, err := n.translateText(n.Ctx, transcription, log)
		if err != nil {
			log.Errorf("TranscriptorNode %s: failed to translate: %v", n.NodeUid, err)
			return fmt.Errorf("failed to translate: %w", err)
		}
		payload["translatedText"] = translatedText
	}

	outMsg := message.NewMessageFromPayload(payload)
	n.sendToOutputs(outMsg, log)
	return nil
}

// callWhisperAPI sends audio to the OpenAI gpt-4o-mini-transcribe API.
// Returns the transcribed text, the language hint used, and any error.
// Note: gpt-4o-mini-transcribe does not support verbose_json nor the /translations
// endpoint, so language detection is not available — n.Language is returned as-is.
func (n *TranscriptorNode) callWhisperAPI(ctx context.Context, audioData []byte, filename, contentType string, log *logger.Logger) (string,  error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("model", whisperModel); err != nil {
		return "", fmt.Errorf("failed to write model field: %w", err)
	}

	if n.Language != "" {
		if err := writer.WriteField("language", n.Language); err != nil {
			return "", fmt.Errorf("failed to write language field: %w", err)
		}
	}

	if err := writer.WriteField("response_format", "json"); err != nil {
		return "", fmt.Errorf("failed to write response_format field: %w", err)
	}

	ext := extensionFromContentType(contentType)
	part, err := writer.CreateFormFile("file", filename+ext)
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(audioData); err != nil {
		return "", fmt.Errorf("failed to write audio data: %w", err)
	}
	writer.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIWhisperURL, &body)
	if err != nil {
		return "", fmt.Errorf("failed to create HTTP request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+n.APIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	log.Infof("TranscriptorNode %s: calling OpenAI %s", n.NodeUid, whisperModel)

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OpenAI API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse API response: %w", err)
	}

	log.Infof("TranscriptorNode %s: transcription complete", n.NodeUid)
	return result.Text, nil
}

// translateToEnglish calls the chat completions API to translate transcribed text to English.
func (n *TranscriptorNode) translateText(ctx context.Context, text string, log *logger.Logger) (string, error) {
	systemPrompt := fmt.Sprintf("Translate the following text to %s. Return only the translation, no explanations.", n.TranslationLanguage)

	payload := map[string]any{
		"model": "gpt-4o-mini",
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": text},
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal translation request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create translation request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+n.APIKey)
	req.Header.Set("Content-Type", "application/json")

	log.Infof("TranscriptorNode %s: translating transcription to English", n.NodeUid)

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("translation HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read translation response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("translation API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse translation response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("empty translation response")
	}

	return result.Choices[0].Message.Content, nil
}

// extensionFromContentType returns the file extension Whisper expects for a given MIME type.
// OpenAI Whisper identifies the format from the filename extension, not the Content-Type header.
func extensionFromContentType(contentType string) string {
	switch contentType {
	case "audio/ogg", "audio/ogg; codecs=opus":
		return ".ogg"
	case "audio/mp3", "audio/mpeg":
		return ".mp3"
	case "audio/mp4":
		return ".mp4"
	case "audio/flac":
		return ".flac"
	case "audio/wav", "audio/wave", "audio/x-wav":
		return ".wav"
	case "audio/webm":
		return ".webm"
	default:
		return ".ogg"
	}
}
