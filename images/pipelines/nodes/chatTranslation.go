package nodes

// Bilingual chat of the viewer: when the digital twin has a second language (chatAssistantSecondLanguage), each
// turn of the AI agent (the question and its answer) is translated into the other language of the conversation.
// The agent answers as always (its system prompt, its tools); one more call to the organization's LLM provider
// (OpenAI-compatible, as the Translator node) detects the language of each text and translates it. The chat
// shows both and the conversation keeps both (utils.MessageTranslation).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"pipelines/utils"
)

// chatLanguageNames: the languages the chat offers, by base code, as the model is told them
var chatLanguageNames = map[string]string{
	"en": "English",
	"es": "Spanish",
	"fr": "French",
	"it": "Italian",
	"de": "German",
	"ca": "Catalan",
	"pt": "Portuguese",
	"zh": "Simplified Chinese (Mandarin, mainland China)",
	"ja": "Japanese",
	"ko": "Korean",
	"ru": "Russian",
	"ar": "Arabic",
	"nl": "Dutch",
	"pl": "Polish",
	"tr": "Turkish",
	"hi": "Hindi",
	"sv": "Swedish",
}

// chatLanguageBase: "es-ES" -> "es", "en-UK-male" -> "en", "zh-CN" -> "zh"; "" for none
func chatLanguageBase(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	if code == "" || code == "none" {
		return ""
	}
	if i := strings.IndexAny(code, "-_"); i > 0 {
		code = code[:i]
	}
	return code
}

func chatLanguageName(code string) string {
	base := chatLanguageBase(code)
	if name, ok := chatLanguageNames[base]; ok {
		return name
	}
	return code
}

// chatBilingualPair: the two languages of a bilingual chat, or ok = false when the digital twin's chat is not
// bilingual (no second language, or the same as the first)
func chatBilingualPair(primary, secondary string) (string, string, bool) {
	a, b := chatLanguageBase(primary), chatLanguageBase(secondary)
	if a == "" || b == "" || a == b {
		return "", "", false
	}
	return primary, secondary, true
}

// chatTurnTranslation is a turn of a bilingual chat in its other language: nil what could not be translated
type chatTurnTranslation struct {
	Question *utils.MessageTranslation
	Answer   *utils.MessageTranslation
}

// chatAnswerText is what the chat shows of an answer of the AI agent: its "message" (the answers that move
// the viewer are JSON with message and uiOpts)
func chatAnswerText(answer string) string {
	parsed := utils.ParseMessage(answer)
	switch parsed.Type {
	case utils.ResponseType:
		if r, ok := parsed.Content.(utils.Response); ok {
			return r.Message
		}
	case utils.EmailType:
		return ""
	}
	return parsed.Raw
}

// chatTranslator calls the OpenAI-compatible chat completions API of the organization's LLM provider
type chatTranslator struct {
	ProviderURL string
	APIKey      string
	Model       string
	HTTPClient  *http.Client
}

// The model writes each text in both languages (copying it as it is in the language it is already written in);
// which one is the original is decided here, by comparing (asking the model which language a text is in gave
// wrong labels now and then: a Spanish answer labelled as Chinese, its translation shown as "Español").
const chatTranslationSystemPrompt = `You translate the turns of a chat between a user and the AI assistant of an industrial digital twin. The chat is bilingual:
- language "a": %s
- language "b": %s
For each text you get ("question" and "answer"), write it in language "a" AND in language "b". The text is already written in one of the two languages (or close to one): in that language copy it exactly as it is; in the other, translate it.
Rules for the translation:
- Keep Markdown exactly (headings, lists, tables, bold, links, line breaks).
- Keep the placeholders like ⟦0⟧, ⟦1⟧ exactly as they are, where they belong in the sentence (they stand for formulas and code).
- Keep numbers, units, dates, code, identifiers, field and sensor names (e.g. windSpeed, dev2pdb_1), node names and product names unchanged.
- Translate naturally, as a professional interpreter would; no explanations, no notes.
Answer only with this JSON object:
{"question":{"a":"...","b":"..."},"answer":{"a":"...","b":"..."}}
If a text is empty, give "" in both.`

type chatBothLanguages struct {
	A string `json:"a"`
	B string `json:"b"`
}

type chatTranslationReply struct {
	Question chatBothLanguages `json:"question"`
	Answer   chatBothLanguages `json:"answer"`
}

// Translate translates a question and its answer of a chat whose languages are primary (a) and secondary (b)
func (t *chatTranslator) Translate(ctx context.Context, primary, secondary, question, answer string) (chatTurnTranslation, error) {
	var out chatTurnTranslation
	// the formulas and the code go aside: the model sees placeholders and they come back as they were
	protectedQuestion, questionSegments := protectChatMath(question)
	protectedAnswer, answerSegments := protectChatMath(answer)
	input, _ := json.Marshal(map[string]string{"question": protectedQuestion, "answer": protectedAnswer})
	system := fmt.Sprintf(chatTranslationSystemPrompt, chatLanguageName(primary), chatLanguageName(secondary))
	content, err := t.complete(ctx, system, string(input), true)
	var status *chatTranslatorStatusError
	if errors.As(err, &status) && status.Code == http.StatusBadRequest {
		// a provider without JSON mode: the prompt asks for JSON anyway
		content, err = t.complete(ctx, system, string(input), false)
	}
	if err != nil {
		return out, err
	}
	var reply chatTranslationReply
	if err := json.Unmarshal([]byte(extractJSONObject(content)), &reply); err != nil {
		return out, fmt.Errorf("the translation is not the JSON asked for: %w", err)
	}
	out.Question = chatTranslationOf(protectedQuestion, reply.Question, primary, secondary)
	out.Answer = chatTranslationOf(protectedAnswer, reply.Answer, primary, secondary)
	if out.Question != nil {
		out.Question.Message = restoreChatMath(out.Question.Message, questionSegments)
	}
	if out.Answer != nil {
		out.Answer.Message = restoreChatMath(out.Answer.Message, answerSegments)
	}
	return out, nil
}

// What the translation must not touch: code blocks, display and inline formulas and LaTeX environments
// (\begin{pmatrix}...\end{pmatrix}), inline code. The model rewrote them (a matrix lost its "$$" and its "&")
var chatMathRe = regexp.MustCompile("(?s)```.*?```" +
	`|\$\$.+?\$\$` +
	`|\\\[.+?\\\]` +
	`|\\\(.+?\\\)` +
	`|\\begin\{([a-zA-Z*]+)\}.*?\\end\{[a-zA-Z*]+\}` +
	`|\$[^$\n]+?\$` +
	"|`[^`\n]+`")

var chatPlaceholderRe = regexp.MustCompile(`⟦(\d+)⟧`)

// protectChatMath replaces the formulas and the code of a text with ⟦0⟧, ⟦1⟧...
func protectChatMath(text string) (string, []string) {
	var segments []string
	protected := chatMathRe.ReplaceAllStringFunc(text, func(m string) string {
		segments = append(segments, m)
		return "⟦" + strconv.Itoa(len(segments)-1) + "⟧"
	})
	return protected, segments
}

// restoreChatMath puts the formulas back; one the model left out goes at the end (better than losing it)
func restoreChatMath(text string, segments []string) string {
	if len(segments) == 0 {
		return text
	}
	used := make([]bool, len(segments))
	restored := chatPlaceholderRe.ReplaceAllStringFunc(text, func(m string) string {
		i, err := strconv.Atoi(chatPlaceholderRe.FindStringSubmatch(m)[1])
		if err != nil || i >= len(segments) {
			return m
		}
		used[i] = true
		return segments[i]
	})
	for i, seg := range segments {
		if !used[i] {
			restored += "\n\n" + seg
		}
	}
	return restored
}

// chatTranslationOf: the text in its other language. The original is the version closer to the text (the model
// copies it in the language it is written in); the translation is the other one
func chatTranslationOf(original string, both chatBothLanguages, primary, secondary string) *utils.MessageTranslation {
	a, b := strings.TrimSpace(both.A), strings.TrimSpace(both.B)
	if strings.TrimSpace(original) == "" || a == "" || b == "" {
		return nil
	}
	if textSimilarity(original, a) >= textSimilarity(original, b) {
		return &utils.MessageTranslation{Language: primary, TranslatedLanguage: secondary, Message: b}
	}
	return &utils.MessageTranslation{Language: secondary, TranslatedLanguage: primary, Message: a}
}

// textSimilarity (0..1): the share of character pairs (bigrams, without spaces, in lower case) that two texts
// have in common (Dice coefficient). Works across scripts: a Chinese text and a Spanish one share none
func textSimilarity(x, y string) float64 {
	bigrams := func(s string) map[string]int {
		runes := []rune(strings.ToLower(strings.Join(strings.Fields(s), "")))
		out := make(map[string]int, len(runes))
		if len(runes) == 1 {
			out[string(runes)]++
		}
		for i := 0; i+1 < len(runes); i++ {
			out[string(runes[i:i+2])]++
		}
		return out
	}
	bx, by := bigrams(x), bigrams(y)
	total, common := 0, 0
	for k, n := range bx {
		total += n
		if m := by[k]; m > 0 {
			common += min(n, m)
		}
	}
	for _, n := range by {
		total += n
	}
	if total == 0 {
		return 0
	}
	return 2 * float64(common) / float64(total)
}

type chatTranslatorStatusError struct {
	Code int
	Body string
}

func (e *chatTranslatorStatusError) Error() string {
	return fmt.Sprintf("translation API error (status %d): %s", e.Code, e.Body)
}

func (t *chatTranslator) complete(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	request := map[string]any{
		"model": t.Model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature": 0.2,
	}
	if jsonMode {
		request["response_format"] = map[string]string{"type": "json_object"}
	}
	body, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(t.ProviderURL, "/")+translatorChatCompletions, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+t.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := t.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("translation request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		text := string(respBody)
		if len(text) > 300 {
			text = text[:300]
		}
		return "", &chatTranslatorStatusError{Code: resp.StatusCode, Body: text}
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("invalid translation response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", errors.New("empty translation response")
	}
	return result.Choices[0].Message.Content, nil
}

// extractJSONObject: the JSON object of a reply that may come in a ```json fence or with text around it
func extractJSONObject(s string) string {
	start, end := strings.IndexByte(s, '{'), strings.LastIndexByte(s, '}')
	if start < 0 || end <= start {
		return s
	}
	return s[start : end+1]
}
