package nodes

import (
	"strings"
	"testing"

	"pipelines/common"
	"pipelines/utils"
)

func TestTelegramAnswerText(t *testing.T) {
	answer := ChatInboxMessage{
		Message: "La carga máxima es **12 N** <por elemento>",
		Translation: &utils.MessageTranslation{
			Language: "es-ES", TranslatedLanguage: "zh-CN", Message: "最大载荷为 **12 N**",
		},
	}
	if !answer.IsAnswer() {
		t.Fatal("an answer")
	}
	got := TelegramAnswerText(answer)
	for _, want := range []string{"<b>12 N</b>", "&lt;por elemento&gt;", "<i>中文</i>", "最大载荷为 <b>12 N</b>"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %q", want, got)
		}
	}
	if (ChatInboxMessage{Transcription: "¿Cuál es la carga?", Message: "¿Cuál es la carga?"}).IsAnswer() {
		t.Error("a question shown in the viewers is not an answer")
	}
}

func TestChatChannelLanguage(t *testing.T) {
	if got := chatChannelLanguage(&common.DigitalTwin{ChatAssistantLanguage: "es-ES", ChatAssistantSecondLanguage: "zh-CN"}); got != "auto" {
		t.Errorf("bilingual = %q", got)
	}
	if got := chatChannelLanguage(&common.DigitalTwin{ChatAssistantLanguage: "es-ES", ChatAssistantSecondLanguage: "none"}); got != "es-ES" {
		t.Errorf("one language = %q", got)
	}
	if got := chatChannelLanguage(&common.DigitalTwin{ChatAssistantLanguage: "none"}); got != "auto" {
		t.Errorf("no language = %q", got)
	}
}
