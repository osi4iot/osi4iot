package nodes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"pipelines/common"
	"pipelines/llmusage"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"strings"
	"time"
)

const (
	ttsModeOpenAI  = "openai-tts"
	ttsModeEdgeTTS = "edge-tts"

	openAITTSURL     = "https://api.openai.com/v1/audio/speech"
	ttsDefaultModel  = "tts-1"
	ttsDefaultFormat = "mp3"

	openAIDefaultVoice  = "alloy"
	edgeTTSDefaultVoice = "en-US-AriaNeural"

	edgeTTSTimeout = 30 * time.Second
)

// edgeTTSVoices maps language → voice_type → ShortName.
// Languages: english, spanish, french, german, italian, portuguese, catalan.
// voice_type: "male" or "female".
// Multiple locales per language are listed; the first entry is the default.
var edgeTTSVoices = map[string]map[string][]string{
	"en": {
		"female": {
			"en-US-AriaNeural",     // US – confident, news/novel
			"en-US-JennyNeural",    // US – friendly, conversational
			"en-US-MichelleNeural", // US – friendly, pleasant
			"en-GB-SoniaNeural",    // UK
			"en-GB-LibbyNeural",    // UK
			"en-AU-NatashaNeural",  // Australia
		},
		"male": {
			"en-US-GuyNeural",         // US – passionate, news/novel
			"en-US-ChristopherNeural", // US – reliable, authoritative
			"en-US-EricNeural",        // US – rational
			"en-GB-RyanNeural",        // UK
			"en-AU-WilliamNeural",     // Australia
		},
	},
	"es": {
		"female": {
			"es-ES-ElviraNeural", // Spain
			"es-MX-DaliaNeural",  // Mexico
			"es-AR-ElenaNeural",  // Argentina
			"es-CO-SalomeNeural", // Colombia
			"es-US-PalomaNeural", // US Spanish
		},
		"male": {
			"es-ES-AlvaroNeural",  // Spain
			"es-MX-JorgeNeural",   // Mexico
			"es-AR-TomasNeural",   // Argentina
			"es-CO-GonzaloNeural", // Colombia
			"es-US-AlonsoNeural",  // US Spanish
		},
	},
	"fr": {
		"female": {
			"fr-FR-DeniseNeural",   // France
			"fr-FR-EloiseNeural",   // France
			"fr-CA-SylvieNeural",   // Canada
			"fr-BE-CharlineNeural", // Belgium
			"fr-CH-ArianeNeural",   // Switzerland
		},
		"male": {
			"fr-FR-HenriNeural",   // France
			"fr-CA-AntoineNeural", // Canada
			"fr-CA-JeanNeural",    // Canada
			"fr-BE-GerardNeural",  // Belgium
			"fr-CH-FabriceNeural", // Switzerland
		},
	},
	"de": {
		"female": {
			"de-DE-KatjaNeural",  // Germany
			"de-DE-AmalaNeural",  // Germany
			"de-AT-IngridNeural", // Austria
			"de-CH-LeniNeural",   // Switzerland
		},
		"male": {
			"de-DE-ConradNeural",  // Germany
			"de-DE-KillianNeural", // Germany
			"de-AT-JonasNeural",   // Austria
			"de-CH-JanNeural",     // Switzerland
		},
	},
	"it": {
		"female": {
			"it-IT-ElsaNeural",     // Italy
			"it-IT-IsabellaNeural", // Italy
		},
		"male": {
			"it-IT-DiegoNeural", // Italy
		},
	},
	"pt": {
		"female": {
			"pt-BR-FranciscaNeural", // Brazil
			"pt-PT-RaquelNeural",    // Portugal
		},
		"male": {
			"pt-BR-AntonioNeural", // Brazil
			"pt-PT-DuarteNeural",  // Portugal
		},
	},
	"ca": {
		"female": {
			"ca-ES-JoanaNeural", // Catalonia (Spain)
		},
		"male": {
			"ca-ES-EnricNeural", // Catalonia (Spain)
		},
	},
	// more languages for the bilingual chat of the viewer
	"zh": {"female": {"zh-CN-XiaoxiaoNeural"}, "male": {"zh-CN-YunxiNeural"}}, // Mandarin (mainland China)
	"ja": {"female": {"ja-JP-NanamiNeural"}, "male": {"ja-JP-KeitaNeural"}},
	"ko": {"female": {"ko-KR-SunHiNeural"}, "male": {"ko-KR-InJoonNeural"}},
	"ru": {"female": {"ru-RU-SvetlanaNeural"}, "male": {"ru-RU-DmitryNeural"}},
	"ar": {"female": {"ar-SA-ZariyahNeural"}, "male": {"ar-SA-HamedNeural"}},
	"nl": {"female": {"nl-NL-ColetteNeural"}, "male": {"nl-NL-MaartenNeural"}},
	"pl": {"female": {"pl-PL-ZofiaNeural"}, "male": {"pl-PL-MarekNeural"}},
	"tr": {"female": {"tr-TR-EmelNeural"}, "male": {"tr-TR-AhmetNeural"}},
	"hi": {"female": {"hi-IN-SwaraNeural"}, "male": {"hi-IN-MadhurNeural"}},
	"sv": {"female": {"sv-SE-SofieNeural"}, "male": {"sv-SE-MattiasNeural"}},
}

// resolveEdgeTTSVoice resolves the voice ShortName for edge-tts mode.
// Priority: explicit "voice" setting → language+voice_type lookup → global default.
func resolveEdgeTTSVoice(settings map[string]any) string {
	language, _ := settings["voiceLanguage"].(string)
	voiceType, _ := settings["voiceGender"].(string)

	if language == "" {
		return edgeTTSDefaultVoice
	}

	byType, ok := edgeTTSVoices[language]
	if !ok {
		return edgeTTSDefaultVoice
	}

	if voiceType == "" {
		voiceType = "female"
	}

	voices, ok := byType[voiceType]
	if !ok || len(voices) == 0 {
		// Fallback to the other gender if requested one is missing.
		for _, v := range byType {
			if len(v) > 0 {
				return v[0]
			}
		}
		return edgeTTSDefaultVoice
	}

	return voices[0]
}

// ─── Node struct ────────────────────────────────────────────────────────────

type Text2SpeechNode struct {
	BaseNode
	Mode       string // "openai" | "edge-tts"
	Voice      string
	Model      string // only used in openai mode
	Format     string
	APIKey     string // only used in openai mode
	httpClient *http.Client
}

// ─── Constructor ────────────────────────────────────────────────────────────

func CreateText2SpeechNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*Text2SpeechNode, error) {
	mode, _ := node.Settings["ttsMode"].(string)
	if mode == "" {
		mode = ttsModeOpenAI
	}
	if mode != ttsModeOpenAI && mode != ttsModeEdgeTTS {
		return nil, fmt.Errorf("invalid ttsMode %q: must be %q or %q", mode, ttsModeOpenAI, ttsModeEdgeTTS)
	}

	var (
		voice          string
		providerApiKey string
		model          string
	)

	switch mode {
	case ttsModeOpenAI:
		orgId := p.GetOrgId()
		providerUrl := fm.GetOrgLlmProviderUrl(orgId)
		providerApiKey = fm.GetOrgLlmProviderApiKey(orgId)
		groupId := p.GetGroupId()

		if !(fm.GetOrgLlmEnabled(orgId) && fm.GetGroupLlmEnabled(groupId)) {
			fm.Log().Errorf("Text2SpeechNode %s: LLM functionality is not enabled for the organization or group", node.NodeUid)
			return nil, fmt.Errorf("LLM functionality is not enabled for the organization or group")
		}
		if providerUrl != "https://api.openai.com/v1" {
			fm.Log().Errorf("Text2SpeechNode %s: LLM provider must be OpenAI for openai mode", node.NodeUid)
			return nil, fmt.Errorf("LLM provider URL must be configured to OpenAI")
		}
		if providerApiKey == "" {
			fm.Log().Errorf("Text2SpeechNode %s: API key must be configured for openai mode", node.NodeUid)
			return nil, fmt.Errorf("API key must be configured")
		}
		voice, _ = node.Settings["voice"].(string)
		if voice == "" {
			voice = openAIDefaultVoice
		}
		model, _ = node.Settings["model"].(string)
		if model == "" {
			model = ttsDefaultModel
		}

	case ttsModeEdgeTTS:
		// voice is resolved from: explicit "voice" > language+voice_type > default.
		voice = resolveEdgeTTSVoice(node.Settings)
		fm.Log().Infof("Text2SpeechNode %s: edge-tts resolved voice: %s", node.NodeUid, voice)
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &Text2SpeechNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Text2Speech",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		Mode:       mode,
		Voice:      voice,
		Model:      model,
		Format:     ttsDefaultFormat,
		APIKey:     providerApiKey,
		httpClient: llmusage.Client(0),
	}, nil
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

func (n *Text2SpeechNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("Text2SpeechNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting Text2SpeechNode with UID: %s (mode: %s, voice: %s)", n.NodeUid, n.Mode, n.Voice)

	n.handleInputWires(log, n.processMessage)
}

func (n *Text2SpeechNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("Text2SpeechNode %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()
	log.Infof("Text2SpeechNode %s stopped successfully", n.NodeUid)
}

// ─── Message processing ─────────────────────────────────────────────────────

func (n *Text2SpeechNode) processMessage(msg common.Message, log *logger.Logger) error {
	text, ok := msg.GetStringFromPayload("message")
	if !ok || text == "" {
		log.Infof("Text2SpeechNode %s: no 'message' field found, forwarding downstream", n.NodeUid)
		n.sendToOutputs(msg, log)
		return nil
	}

	var (
		audioData []byte
		err       error
	)

	switch n.Mode {
	case ttsModeOpenAI:
		// OpenAI's speech is billed by characters (tts-1) or tokens (gpt-4o-mini-tts, not reported in
		// the audio answer): the characters sent are recorded with the request (llmusage)
		usageCtx, counter := llmusage.WithCounter(n.Ctx)
		audioData, err = n.synthesizeOpenAI(usageCtx, text)
		if usage := counter.Usage(); usage.Requests > 0 {
			usage.Characters = len([]rune(text))
			n.recordLlmUsage(llmusage.SourceText2Speech, messageUserName(msg), "openai", n.Model, usage)
		}
	case ttsModeEdgeTTS:
		voice := n.Voice
		// a message can ask for another language: payload["voiceLanguage"] ("es", "en"...)
		if language, ok := msg.GetStringFromPayload("voiceLanguage"); ok && language != "" {
			// "es-ES" -> "es"
			if i := strings.IndexAny(language, "-_"); i > 0 {
				language = language[:i]
			}
			settings := map[string]any{"voiceLanguage": strings.ToLower(language)}
			if gender, ok := n.Settings["voiceGender"].(string); ok {
				settings["voiceGender"] = gender
			}
			voice = resolveEdgeTTSVoice(settings)
		}
		audioData, err = n.synthesizeEdgeTTSWithVoice(n.Ctx, text, voice)
		if err != nil {
			// Microsoft's service is not an official API (it stopped accepting the old token in October 2026):
			// OpenAI's voice as a fallback, when the organization has it ("openaiFallback": false turns it off)
			if fallback, fbErr := n.openAIFallback(msg, text); fbErr == nil {
				log.Warnf("Text2SpeechNode %s: edge-tts failed (%v): read with OpenAI's voice", n.NodeUid, err)
				audioData, err = fallback, nil
			} else if !errors.Is(fbErr, errNoOpenAIFallback) {
				err = fmt.Errorf("%v; OpenAI fallback: %w", err, fbErr)
			}
		}
	}

	if err != nil {
		log.Errorf("Text2SpeechNode %s: failed to synthesize speech: %v", n.NodeUid, err)
		return fmt.Errorf("failed to synthesize speech: %w", err)
	}

	contentType := audioContentType(n.Format)
	filename := "speech." + n.Format

	outMsg := message.NewMessageFromPayload(msg.GetPayload())
	// for a NATS request, a Publish node with "Reply" sends the audio back to the sender
	outMsg.Topic = msg.GetTopic()
	outMsg.SetReplyContext(msg.GetReplyContext())
	outMsg.SetSender(msg.GetSender())
	if err := outMsg.AttachAudio(audioData, filename, contentType); err != nil {
		log.Errorf("Text2SpeechNode %s: failed to attach audio to message: %v", n.NodeUid, err)
		return fmt.Errorf("failed to attach audio: %w", err)
	}

	n.sendToOutputs(outMsg, log)
	return nil
}

var errNoOpenAIFallback = errors.New("no OpenAI fallback")

// openAIFallback reads the text with OpenAI's voice when edge-tts failed: only when the organization's LLM
// provider is OpenAI with its API key and LLM is enabled in the organization and the group (read now: they can
// change without restarting the pipeline)
func (n *Text2SpeechNode) openAIFallback(msg common.Message, text string) ([]byte, error) {
	if off, ok := n.Settings["openaiFallback"].(bool); ok && !off {
		return nil, errNoOpenAIFallback
	}
	orgId := n.Pipeline.GetOrgId()
	apiKey := n.Fm.GetOrgLlmProviderApiKey(orgId)
	if apiKey == "" || !strings.Contains(n.Fm.GetOrgLlmProviderUrl(orgId), "api.openai.com") ||
		!(n.Fm.GetOrgLlmEnabled(orgId) && n.Fm.GetGroupLlmEnabled(n.Pipeline.GetGroupId())) {
		return nil, errNoOpenAIFallback
	}
	ctx, cancel := context.WithTimeout(n.Ctx, chatVoiceTTSTimeout)
	defer cancel()
	usageCtx, counter := llmusage.WithCounter(ctx)
	audio, err := chatVoiceOpenAITTS(usageCtx, llmusage.Client(0), apiKey, text)
	if usage := counter.Usage(); usage.Requests > 0 {
		usage.Characters = len([]rune(text))
		n.recordLlmUsage(llmusage.SourceText2Speech, messageUserName(msg), "openai", ttsDefaultModel, usage)
	}
	return audio, err
}

// ─── Backends ───────────────────────────────────────────────────────────────

// synthesizeOpenAI calls the OpenAI TTS REST API and returns raw audio bytes.
func (n *Text2SpeechNode) synthesizeOpenAI(ctx context.Context, text string) ([]byte, error) {
	reqPayload := map[string]any{
		"model":           n.Model,
		"input":           text,
		"voice":           n.Voice,
		"response_format": n.Format,
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAITTSURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+n.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI TTS API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// synthesizeEdgeTTSWithVoice is synthesizeEdgeTTS with a given voice (ShortName): the client of
// edgeTtsClient.go (Sec-MS-GEC v2 token).
func (n *Text2SpeechNode) synthesizeEdgeTTSWithVoice(ctx context.Context, text, voice string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, edgeTTSTimeout)
	defer cancel()
	return edgeTTSSynthesize(ctx, text, voice)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// audioContentType returns the MIME type for a given TTS output format.
func audioContentType(format string) string {
	switch format {
	case "mp3":
		return "audio/mpeg"
	case "opus":
		return "audio/ogg; codecs=opus"
	case "aac":
		return "audio/aac"
	case "flac":
		return "audio/flac"
	case "wav":
		return "audio/wav"
	case "pcm":
		return "audio/pcm"
	default:
		return "audio/mpeg"
	}
}
