package nodes

// The chat channels of the viewer's chat assistant: other ways to ask the digital twin's AI agent, built into
// pipelines (no nodes in the pipeline). What comes through a channel becomes a question of the user as if it
// had been written in the viewer: it is published on the user's own copy of the sim2llm topic, so the AI agent
// of the pipeline (Listen sim2llm -> AI Agent -> Publish llm2sim) answers it with the user's conversation, the
// bilingual translation and the answer in the user's inbox, where the viewer shows it.
//   - Voice messages of the phone ("Mobile audio" sensor of the "Mobile sensors" page): the page publishes the
//     audio on the user's copy of the digital twin's sim2state topic (header "Voice-Request: question"), which
//     only that user may publish on (chatVoice.go).
//   - Telegram: the messages and voice notes of the digital twin's Telegram chat, of users who linked their
//     account (/link <code>); the answer goes back to Telegram as text (flows_manager/chat_telegram.go).

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"pipelines/common"
	"pipelines/llmusage"
	"pipelines/utils"
)

const chatChannelSTTTimeout = 60 * time.Second

// chatTopicSubject is the NATS subject of a topic of the digital twin (sim2llm, llm2sim...), "" if it has none
func chatTopicSubject(fm common.Manager, dt *common.DigitalTwin, topicRef string) string {
	topic := fm.GetTopicByTopicRef(dt.AssetId, dt.Id, topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

// AskChatAsUser sends a question to the digital twin's chat as the user: the viewers of the user show it (as
// the voice questions, field "transcription") and the AI agent answers it. via: "mobile", "telegram"
func AskChatAsUser(fm common.Manager, dt *common.DigitalTwin, userName, text, via string) error {
	return AskChatAsUserWithAttachments(fm, dt, userName, text, via, nil)
}

// AskChatAsUserWithAttachments is AskChatAsUser with files attached to the question (stored already in the
// user's folder, utils.PutChatAttachment): the chat shows them and the AI agent reads them.
func AskChatAsUserWithAttachments(fm common.Manager, dt *common.DigitalTwin, userName, text, via string,
	attachments []utils.ChatAttachment) error {
	text = strings.TrimSpace(text)
	if userName == "" || text == "" && len(attachments) == 0 {
		return errors.New("a question needs a user and a text")
	}
	sim2llm := chatTopicSubject(fm, dt, "sim2llm")
	llm2sim := chatTopicSubject(fm, dt, "llm2sim")
	if sim2llm == "" || llm2sim == "" {
		return fmt.Errorf("the digital twin %d has no sim2llm or llm2sim topic", dt.Id)
	}
	shownMsg := map[string]any{"transcription": text, "userName": userName, "via": via}
	askedMsg := map[string]any{"message": text, "via": via}
	if len(attachments) > 0 {
		shownMsg["attachments"] = attachments
		askedMsg["attachments"] = attachments
	}
	shown, _ := json.Marshal(shownMsg)
	if err := fm.NatsPublish(utils.UserInboxSubject(userName, llm2sim), shown); err != nil {
		return err
	}
	asked, _ := json.Marshal(askedMsg)
	return fm.NatsPublish(utils.UserChatSubject(userName, sim2llm), asked)
}

// chatChannelLanguage: the language a channel's audio is transcribed in. A bilingual chat lets it be detected
// between its two languages (chatVoiceLanguageHint); a chat in one language, that one (a short Spanish sentence
// came out in Catalan when it was detected among all)
func chatChannelLanguage(dt *common.DigitalTwin) string {
	if _, _, ok := chatBilingualPair(dt.ChatAssistantLanguage, dt.ChatAssistantSecondLanguage); ok {
		return "auto"
	}
	if chatLanguageBase(dt.ChatAssistantLanguage) == "" {
		return "auto"
	}
	return dt.ChatAssistantLanguage
}

// TranscribeChatAudio transcribes the audio of a channel with OpenAI (as the chat's voice service); language
// "" is the chat's (chatChannelLanguage)
func TranscribeChatAudio(ctx context.Context, fm common.Manager, dt *common.DigitalTwin, userName string, audio []byte, contentType, language string) (string, error) {
	access := chatVoiceAccessOf(fm, dt)
	if !access.canUseOpenAI() {
		return "", errors.New("speech to text needs the organization's OpenAI API key and LLM enabled in the organization and the group")
	}
	if language == "" {
		language = chatChannelLanguage(dt)
	}
	sttCtx, cancel := context.WithTimeout(ctx, chatChannelSTTTimeout)
	defer cancel()
	usageCtx, counter := llmusage.WithCounter(sttCtx)
	text, err := chatVoiceTranscribe(usageCtx, llmusage.Client(0), access.apiKey, audio, contentType, language,
		chatVoiceLanguageHint(dt, language))
	llmusage.Add(llmusage.Attribution{
		OrgID: dt.OrgId, GroupID: dt.GroupId, DigitalTwinID: dt.Id, DigitalTwinUID: dt.DigitalTwinUid,
		NodeType: "ChatVoice", NodeName: "Chat voice", UserName: userName, ProviderType: "openai",
		Source: llmusage.SourceTranscriptor,
	}, chatVoiceUsage(counter.Usage(), whisperModel))
	return strings.TrimSpace(text), err
}

// ChatInboxMessage is a message of the user's inbox for the llm2sim topic: an answer of the AI agent, or a
// question shown in the viewers ("transcription")
type ChatInboxMessage struct {
	Message       string                    `json:"message"`
	Transcription string                    `json:"transcription"`
	Translation   *utils.MessageTranslation `json:"translation"`
	EmailBody     string                    `json:"emailBody"`
}

// IsAnswer tells whether the message is an answer of the AI agent (not a question shown in the viewers)
func (m ChatInboxMessage) IsAnswer() bool {
	return m.Transcription == "" && (strings.TrimSpace(m.Message) != "" || strings.TrimSpace(m.EmailBody) != "")
}

const telegramMaxText = 4000

// telegramHTML (telegramLatex.go): a chat text as Telegram HTML, its formulas as text

// TelegramAnswerText is an answer of the AI agent as it is sent to Telegram (HTML): the answer and, in a
// bilingual chat, its translation under the name of its language
func TelegramAnswerText(m ChatInboxMessage) string {
	answer := m.Message
	if strings.TrimSpace(answer) == "" {
		answer = m.EmailBody
	}
	translation := ""
	if m.Translation != nil {
		translation = strings.TrimSpace(m.Translation.Message)
	}
	build := func(answer, translation string) string {
		text := telegramHTML(answer)
		if translation != "" {
			text += "\n\n<i>" + html.EscapeString(chatLanguageNativeName(m.Translation.TranslatedLanguage)) + "</i>\n" +
				telegramHTML(translation)
		}
		return text
	}
	text := build(answer, translation)
	// too long: the source texts are shortened (cutting the HTML could leave a <pre> or a <b> open, and
	// Telegram would refuse the message)
	for n := max(len([]rune(answer)), len([]rune(translation))); len([]rune(text)) > telegramMaxText && n > 0; {
		n = n * 4 / 5
		text = build(truncateRunes(answer, n), truncateRunes(translation, n))
	}
	return text
}

func truncateRunes(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

// chatLanguageNativeNames: the name of each language in itself (as the chat shows it)
var chatLanguageNativeNames = map[string]string{
	"en": "English", "es": "Español", "fr": "Français", "it": "Italiano", "de": "Deutsch", "ca": "Català",
	"pt": "Português", "zh": "中文", "ja": "日本語", "ko": "한국어", "ru": "Русский", "ar": "العربية",
	"nl": "Nederlands", "pl": "Polski", "tr": "Türkçe", "hi": "हिन्दी", "sv": "Svenska",
}

func chatLanguageNativeName(code string) string {
	if name, ok := chatLanguageNativeNames[chatLanguageBase(code)]; ok {
		return name
	}
	return code
}
