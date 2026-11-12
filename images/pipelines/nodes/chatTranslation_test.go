package nodes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pipelines/common"
)

func TestChatBilingualPair(t *testing.T) {
	if _, _, ok := chatBilingualPair("es-ES", "none"); ok {
		t.Error("none is not bilingual")
	}
	if _, _, ok := chatBilingualPair("en-UK-male", "en-GB"); ok {
		t.Error("the same language is not bilingual")
	}
	if a, b, ok := chatBilingualPair("es-ES", "zh-CN"); !ok || a != "es-ES" || b != "zh-CN" {
		t.Errorf("es-ES/zh-CN = %s %s %v", a, b, ok)
	}
	if chatLanguageName("zh-CN") != "Simplified Chinese (Mandarin, mainland China)" || chatLanguageName("en-UK-female") != "English" {
		t.Error("language names")
	}
}

func TestChatAnswerText(t *testing.T) {
	if got := chatAnswerText(`{"message":"Hola","uiOpts":{"camera":"front"}}`); got != "Hola" {
		t.Errorf("JSON answer = %q", got)
	}
	if got := chatAnswerText("La **potencia** es 5 MW"); got != "La **potencia** es 5 MW" {
		t.Errorf("text answer = %q", got)
	}
}

func TestChatTranslatorTranslate(t *testing.T) {
	var asked map[string]any
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &asked)
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer key" {
			http.Error(w, "bad request", http.StatusUnauthorized)
			return
		}
		if _, json := asked["response_format"]; json && calls == 1 {
			// a provider without JSON mode
			http.Error(w, "response_format not supported", http.StatusBadRequest)
			return
		}
		content := "```json\n{\"question\":{\"a\":\"¿Cuál es la velocidad del viento?\",\"b\":\"风速是多少？\"}," +
			"\"answer\":{\"a\":\"La velocidad del viento es **12.5 m/s**.\",\"b\":\"风速为 **12.5 m/s**。\"}}\n```"
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
	}))
	defer server.Close()
	tr := &chatTranslator{ProviderURL: server.URL + "/v1/", APIKey: "key", Model: "gpt-4o-mini"}
	got, err := tr.Translate(context.Background(), "es-ES", "zh-CN", "风速是多少？", `{"message":"La velocidad del viento es **12.5 m/s**."}`)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Errorf("calls = %d (JSON mode, then without it)", calls)
	}
	if got.Question == nil || got.Question.Language != "zh-CN" || got.Question.TranslatedLanguage != "es-ES" ||
		got.Question.Message != "¿Cuál es la velocidad del viento?" {
		t.Errorf("question = %+v", got.Question)
	}
	if got.Answer == nil || got.Answer.Language != "es-ES" || got.Answer.TranslatedLanguage != "zh-CN" || !strings.Contains(got.Answer.Message, "12.5 m/s") {
		t.Errorf("answer = %+v", got.Answer)
	}
	// what the model got: the two languages and the answer's text (not its JSON)
	messages, _ := asked["messages"].([]any)
	system := messages[0].(map[string]any)["content"].(string)
	user := messages[1].(map[string]any)["content"].(string)
	if !strings.Contains(system, "Spanish") || !strings.Contains(system, "Simplified Chinese") {
		t.Errorf("system prompt without the languages: %s", system)
	}
	if strings.Contains(user, "uiOpts") || !strings.Contains(user, "La velocidad del viento") {
		t.Errorf("user content = %s", user)
	}
}

func TestChatEdgeVoice(t *testing.T) {
	cases := map[[2]string]string{
		{"zh-CN", "female"}: "zh-CN-XiaoxiaoNeural",
		{"zh-CN", "male"}:   "zh-CN-YunxiNeural",
		{"es-ES", ""}:       "es-ES-ElviraNeural",
		{"pt-PT", "female"}: "pt-PT-RaquelNeural",
		{"xx-YY", "female"}: "",
	}
	for in, want := range cases {
		if got := chatEdgeVoice(in[0], in[1]); got != want {
			t.Errorf("voice %v = %q, want %q", in, got, want)
		}
	}
}

// The model copies a text with small changes (punctuation, a space): it is still the original
func TestChatTranslationOf(t *testing.T) {
	answer := "¡Hola! Muy bien, gracias. ¿En qué puedo ayudarte?"
	tr := chatTranslationOf(answer, chatBothLanguages{A: "¡Hola! Muy bien, gracias. ¿En qué puedo ayudarte? ", B: "你好！我很好，谢谢。有什么我可以帮助你的吗？"}, "es-ES", "zh-CN")
	if tr == nil || tr.Language != "es-ES" || tr.TranslatedLanguage != "zh-CN" || !strings.HasPrefix(tr.Message, "你好") {
		t.Errorf("Spanish answer = %+v", tr)
	}
	question := "今天是星期几？"
	tr = chatTranslationOf(question, chatBothLanguages{A: "¿Qué día es hoy?", B: "今天是星期几?"}, "es-ES", "zh-CN")
	if tr == nil || tr.Language != "zh-CN" || tr.TranslatedLanguage != "es-ES" || tr.Message != "¿Qué día es hoy?" {
		t.Errorf("Chinese question = %+v", tr)
	}
	if chatTranslationOf("hola", chatBothLanguages{A: "hola", B: ""}, "es-ES", "zh-CN") != nil {
		t.Error("without a translation there is none")
	}
	if textSimilarity("Son las 12:13", "现在是12:13") >= textSimilarity("Son las 12:13", "Son las 12:13.") {
		t.Error("similarity")
	}
}

// The formulas go untouched: the model only sees placeholders
func TestChatMathProtection(t *testing.T) {
	answer := "Una matriz simétrica podría ser:\n\n$$\n\\begin{pmatrix} 10 & 1 & 2 \\\\ 1 & 12 & -1 \\\\ 2 & -1 & 15 \\end{pmatrix}\n$$\n\nCon $a_{ii} > \\sum |a_{ij}|$ y el campo `windSpeed`."
	protected, segments := protectChatMath(answer)
	if len(segments) != 3 || strings.ContainsAny(protected, "$&`") || strings.Contains(protected, "pmatrix") {
		t.Fatalf("protected = %q (%d segments)", protected, len(segments))
	}
	translated := "一个对称矩阵可以是：\n\n⟦0⟧\n\n其中 ⟦1⟧，字段 ⟦2⟧。"
	restored := restoreChatMath(translated, segments)
	if !strings.Contains(restored, "10 & 1 & 2") || !strings.Contains(restored, "$a_{ii}") || !strings.Contains(restored, "`windSpeed`") {
		t.Errorf("restored = %q", restored)
	}
	// a placeholder the model dropped: the formula goes at the end
	if got := restoreChatMath("一个对称矩阵：⟦0⟧", segments); !strings.Contains(got, "`windSpeed`") || !strings.Contains(got, "$a_{ii}") {
		t.Errorf("dropped placeholders = %q", got)
	}
	// LaTeX without delimiters (an environment alone) and \[ \]
	_, segs := protectChatMath("Matriz:\n\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} y \\[ x^2 \\]")
	if len(segs) != 2 {
		t.Errorf("segments = %q", segs)
	}
}

func TestChatVoiceLanguageHint(t *testing.T) {
	dt := &common.DigitalTwin{ChatAssistantLanguage: "es-ES", ChatAssistantSecondLanguage: "zh-CN"}
	if hint := chatVoiceLanguageHint(dt, "auto"); !strings.Contains(hint, "Spanish") || !strings.Contains(hint, "Simplified Chinese") {
		t.Errorf("hint = %q", hint)
	}
	if hint := chatVoiceLanguageHint(dt, "es-ES"); hint != "" {
		t.Errorf("a fixed language needs no hint: %q", hint)
	}
	if hint := chatVoiceLanguageHint(&common.DigitalTwin{ChatAssistantLanguage: "es-ES", ChatAssistantSecondLanguage: "none"}, "auto"); hint != "" {
		t.Errorf("not bilingual: %q", hint)
	}
}
