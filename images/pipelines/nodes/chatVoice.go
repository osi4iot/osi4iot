package nodes

// The voice of the viewer's chat, built into pipelines: no nodes in the pipeline are needed. The chat sends
// NATS requests on the user's own copy of the digital twin's sim2state topic (utils.UserChatSubject: only that
// user may publish there) with the header "Voice-Request":
//   - "stt": audio (Content-Type audio/webm, audio/ogg, audio/mp4...), header "Payload-Language" ("es-ES", or
//     "auto" in a bilingual chat: the language is detected)  ->  {"message": "the transcription"}
//   - "tts": JSON {"ttsText": "...", "voiceLanguage": "zh-CN", "voiceGender": "female"}  ->  audio/mpeg
//   - "question": a voice message of the phone for the chat (chatChannels.go): transcribed and asked as the
//     user  ->  {"message": "the transcription"}
// A failure is answered with the header "Voice-Error" and {"error": "..."}.
//
// Speech to text uses OpenAI's transcription (as the Transcriptor node: the organization's API key, LLM enabled
// in the organization and the group). Text to speech uses Microsoft Edge's voices (edge-tts, free: the
// languages of edgeTTSVoices) and, if that fails or the language has no Edge voice, OpenAI's.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/llmusage"
	"pipelines/message"

	"github.com/nats-io/nats.go"
)

const (
	ChatVoiceRequestHeader  = "Voice-Request"
	chatVoiceErrorHeader    = "Voice-Error"
	chatVoiceSTTTimeout     = 60 * time.Second
	chatVoiceTTSTimeout     = 30 * time.Second
	chatVoiceOpenAITTSVoice = "nova"
	// the most text read aloud at once (characters): longer answers are cut
	chatVoiceMaxTTSChars = 4000
)

type chatVoiceAccess struct {
	orgId, groupId int
	apiKey         string
	providerURL    string
	llmEnabled     bool
}

func chatVoiceAccessOf(fm common.Manager, dt *common.DigitalTwin) chatVoiceAccess {
	return chatVoiceAccess{
		orgId:       dt.OrgId,
		groupId:     dt.GroupId,
		apiKey:      fm.GetOrgLlmProviderApiKey(dt.OrgId),
		providerURL: fm.GetOrgLlmProviderUrl(dt.OrgId),
		llmEnabled:  fm.GetOrgLlmEnabled(dt.OrgId) && fm.GetGroupLlmEnabled(dt.GroupId),
	}
}

// OpenAI's transcription and voices: the organization's LLM provider is OpenAI (its key is OpenAI's)
func (a chatVoiceAccess) canUseOpenAI() bool {
	return a.llmEnabled && a.apiKey != "" && strings.Contains(a.providerURL, "api.openai.com")
}

// HandleChatVoiceRequest answers a voice request of a user of the digital twin's chat
func HandleChatVoiceRequest(ctx context.Context, fm common.Manager, digitalTwinId int, msg *nats.Msg, userName string) {
	log := fm.Log()
	kind := strings.ToLower(strings.TrimSpace(msg.Header.Get(ChatVoiceRequestHeader)))
	dt := fm.GetDigitalTwin(digitalTwinId)
	if dt == nil || !dt.ChatAssistantEnabled {
		respondChatVoiceError(msg, "the chat assistant of the digital twin is not enabled")
		return
	}
	access := chatVoiceAccessOf(fm, dt)
	attribution := llmusage.Attribution{
		OrgID: dt.OrgId, GroupID: dt.GroupId, DigitalTwinID: dt.Id, DigitalTwinUID: dt.DigitalTwinUid,
		NodeType: "ChatVoice", NodeName: "Chat voice", UserName: userName, ProviderType: "openai",
	}
	started := time.Now()
	switch kind {
	case "stt":
		if !access.canUseOpenAI() {
			respondChatVoiceError(msg, "speech to text needs the organization's OpenAI API key and LLM enabled in the organization and the group")
			return
		}
		sttCtx, cancel := context.WithTimeout(ctx, chatVoiceSTTTimeout)
		defer cancel()
		usageCtx, counter := llmusage.WithCounter(sttCtx)
		contentType := msg.Header.Get("Content-Type")
		language := msg.Header.Get("Payload-Language")
		text, err := chatVoiceTranscribe(usageCtx, llmusage.Client(0), access.apiKey, msg.Data, contentType, language,
			chatVoiceLanguageHint(dt, language))
		attribution.Source = llmusage.SourceTranscriptor
		llmusage.Add(attribution, chatVoiceUsage(counter.Usage(), whisperModel))
		if err != nil {
			log.Errorf("Chat voice of digital twin %d: speech to text of %s failed: %v", dt.Id, userName, err)
			respondChatVoiceError(msg, "speech to text failed: "+err.Error())
			return
		}
		log.Infof("Chat voice of digital twin %d: %s transcribed (%d bytes of %s) in %s", dt.Id, userName, len(msg.Data),
			message.MediaType(contentType), time.Since(started).Round(time.Millisecond))
		body, _ := json.Marshal(map[string]string{"message": strings.TrimSpace(text)})
		respondChatVoice(msg, "application/json", body)
	case "tts":
		var request struct {
			TtsText       string `json:"ttsText"`
			VoiceLanguage string `json:"voiceLanguage"`
			VoiceGender   string `json:"voiceGender"`
		}
		if err := json.Unmarshal(msg.Data, &request); err != nil || strings.TrimSpace(request.TtsText) == "" {
			respondChatVoiceError(msg, "text to speech needs {\"ttsText\": \"...\"}")
			return
		}
		text := request.TtsText
		if runes := []rune(text); len(runes) > chatVoiceMaxTTSChars {
			text = string(runes[:chatVoiceMaxTTSChars])
		}
		audio, engine, err := chatVoiceSynthesize(ctx, access, attribution, text, request.VoiceLanguage, request.VoiceGender)
		if err != nil {
			log.Errorf("Chat voice of digital twin %d: text to speech for %s failed: %v", dt.Id, userName, err)
			respondChatVoiceError(msg, "text to speech failed: "+err.Error())
			return
		}
		log.Infof("Chat voice of digital twin %d: %d characters read for %s (%s, %s) in %s", dt.Id, len([]rune(text)), userName,
			engine, request.VoiceLanguage, time.Since(started).Round(time.Millisecond))
		respondChatVoice(msg, "audio/mpeg", audio)
	case "question":
		// a voice message of the phone for the chat (chatChannels.go): transcribed and asked as the user
		if !dt.ChatMobileVoiceEnabled {
			respondChatVoiceError(msg, "the chat of the digital twin does not take voice messages from the phone")
			return
		}
		text, err := TranscribeChatAudio(ctx, fm, dt, userName, msg.Data, msg.Header.Get("Content-Type"), msg.Header.Get("Payload-Language"))
		if err != nil {
			log.Errorf("Chat voice of digital twin %d: voice message of %s not transcribed: %v", dt.Id, userName, err)
			respondChatVoiceError(msg, "speech to text failed: "+err.Error())
			return
		}
		if text != "" {
			if err := AskChatAsUser(fm, dt, userName, text, "mobile"); err != nil {
				log.Errorf("Chat voice of digital twin %d: voice message of %s not sent to the chat: %v", dt.Id, userName, err)
				respondChatVoiceError(msg, "the question could not be sent to the chat: "+err.Error())
				return
			}
		}
		log.Infof("Chat voice of digital twin %d: voice message of %s sent to the chat in %s", dt.Id, userName,
			time.Since(started).Round(time.Millisecond))
		body, _ := json.Marshal(map[string]string{"message": text})
		respondChatVoice(msg, "application/json", body)
	default:
		respondChatVoiceError(msg, fmt.Sprintf("unknown voice request %q (stt, tts or question)", kind))
	}
}

func chatVoiceUsage(u llmusage.Usage, model string) llmusage.Usage {
	if u.Model == "" {
		u.Model = model
	}
	return u
}

// chatEdgeVoice: the Edge voice of a language ("zh-CN" -> zh-CN-XiaoxiaoNeural), "" when it has none
func chatEdgeVoice(language, gender string) string {
	base := chatLanguageBase(language)
	byGender, ok := edgeTTSVoices[base]
	if !ok {
		return ""
	}
	if gender != "male" {
		gender = "female"
	}
	if voices := byGender[gender]; len(voices) > 0 {
		// the voice of the language's region when there is one (pt-PT, es-MX...)
		for _, v := range voices {
			if strings.HasPrefix(strings.ToLower(v), strings.ToLower(language)+"-") {
				return v
			}
		}
		return voices[0]
	}
	for _, voices := range byGender {
		if len(voices) > 0 {
			return voices[0]
		}
	}
	return ""
}

func chatVoiceSynthesize(ctx context.Context, access chatVoiceAccess, attribution llmusage.Attribution, text, language, gender string) ([]byte, string, error) {
	var edgeErr error
	if voice := chatEdgeVoice(language, gender); voice != "" {
		edgeCtx, cancel := context.WithTimeout(ctx, chatVoiceTTSTimeout)
		audio, err := edgeTTSSynthesize(edgeCtx, text, voice)
		cancel()
		if err == nil {
			return audio, "edge-tts " + voice, nil
		}
		edgeErr = err
	} else {
		edgeErr = fmt.Errorf("no Edge voice for %q", language)
	}
	if !access.canUseOpenAI() {
		return nil, "", edgeErr
	}
	openaiCtx, cancel := context.WithTimeout(ctx, chatVoiceTTSTimeout)
	defer cancel()
	usageCtx, counter := llmusage.WithCounter(openaiCtx)
	audio, err := chatVoiceOpenAITTS(usageCtx, llmusage.Client(0), access.apiKey, text)
	usage := chatVoiceUsage(counter.Usage(), ttsDefaultModel)
	if usage.Requests > 0 {
		usage.Characters = len([]rune(text))
	}
	attribution.Source = llmusage.SourceText2Speech
	llmusage.Add(attribution, usage)
	if err != nil {
		return nil, "", fmt.Errorf("%v; OpenAI: %w", edgeErr, err)
	}
	return audio, "openai " + ttsDefaultModel, nil
}

func respondChatVoice(msg *nats.Msg, contentType string, data []byte) {
	if msg.Reply == "" {
		return
	}
	reply := nats.NewMsg(msg.Reply)
	reply.Header.Set("Content-Type", contentType)
	reply.Data = data
	_ = msg.RespondMsg(reply)
}

func respondChatVoiceError(msg *nats.Msg, text string) {
	if msg.Reply == "" {
		return
	}
	body, _ := json.Marshal(map[string]string{"error": text})
	reply := nats.NewMsg(msg.Reply)
	reply.Header.Set("Content-Type", "application/json")
	reply.Header.Set(chatVoiceErrorHeader, "true")
	reply.Data = body
	_ = msg.RespondMsg(reply)
}

// chatVoiceLanguageHint: in a bilingual chat with the language detected ("auto"), what the transcription is told:
// the two languages spoken (it chooses among almost 100: a short or badly pronounced Spanish sentence came out
// in Catalan). "" otherwise
func chatVoiceLanguageHint(dt *common.DigitalTwin, language string) string {
	if base := chatLanguageBase(language); base != "" && base != "auto" {
		return ""
	}
	primary, secondary, ok := chatBilingualPair(dt.ChatAssistantLanguage, dt.ChatAssistantSecondLanguage)
	if !ok {
		return ""
	}
	return fmt.Sprintf("The speaker speaks either %s or %s, never another language. Transcribe in the language spoken.",
		chatLanguageName(primary), chatLanguageName(secondary))
}

// chatVoiceTranscribe: OpenAI's transcription of an audio; language "" or "auto" lets it detect the language,
// guided by hint (the languages that may be spoken)
func chatVoiceTranscribe(ctx context.Context, client *http.Client, apiKey string, audio []byte, contentType, language, hint string) (string, error) {
	if len(audio) == 0 {
		return "", errors.New("no audio")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("model", whisperModel)
	_ = writer.WriteField("response_format", "json")
	if base := chatLanguageBase(language); base != "" && base != "auto" {
		_ = writer.WriteField("language", base)
	} else if hint != "" {
		_ = writer.WriteField("prompt", hint)
	}
	part, err := writer.CreateFormFile("file", "speech"+extensionFromContentType(contentType))
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audio); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIWhisperURL, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OpenAI API error (status %d): %s", resp.StatusCode, chatVoiceShort(string(respBody)))
	}
	var result struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("invalid transcription response: %w", err)
	}
	return result.Text, nil
}

// chatVoiceOpenAITTS: OpenAI's speech of a text (MP3); its voices speak every language
func chatVoiceOpenAITTS(ctx context.Context, client *http.Client, apiKey, text string) ([]byte, error) {
	body, _ := json.Marshal(map[string]string{
		"model": ttsDefaultModel, "input": text, "voice": chatVoiceOpenAITTSVoice, "response_format": "mp3",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAITTSURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI TTS API error (status %d): %s", resp.StatusCode, chatVoiceShort(string(respBody)))
	}
	return respBody, nil
}

func chatVoiceShort(s string) string {
	if len(s) > 300 {
		return s[:300]
	}
	return s
}
