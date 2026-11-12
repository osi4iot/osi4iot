package nodes

// The AI agent's part of the bilingual chat (chatTranslation.go): each turn is translated when the answer is
// ready, before it is stored, and the translations go with the answer to the chat (fields "translation" and
// "questionTranslation" of the llm2sim message).

import (
	"context"
	"strings"
	"time"

	"pipelines/llmusage"
)

const chatTranslationTimeout = 60 * time.Second

// bilingualPair: the languages of the digital twin's chat when it is bilingual (read at each turn: editing the
// digital twin changes them without restarting the pipeline)
func (n *AiAgentNode) bilingualPair() (string, string, bool) {
	dt := n.Fm.GetDigitalTwin(n.Pipeline.GetDigitalTwinId())
	if dt == nil {
		return "", "", false
	}
	return chatBilingualPair(dt.ChatAssistantLanguage, dt.ChatAssistantSecondLanguage)
}

// chatTranslationModel: gpt-4o-mini (fast and cheap) when the organization allows it, else its first model
func chatTranslationModel(allowed []string, providerURL string) string {
	for _, m := range allowed {
		if strings.HasSuffix(strings.TrimSpace(m), translatorDefaultModel) {
			return llmModelID(m, providerURL)
		}
	}
	return llmModelID(defaultLlmModel(allowed, translatorDefaultModel), providerURL)
}

// translateTurn translates a question and its answer (the text the chat shows of it) when the chat is
// bilingual. ok = false when it is not, or the translation failed (the answer goes untranslated)
func (n *AiAgentNode) translateTurn(userName, question, answer string) (chatTurnTranslation, bool) {
	primary, secondary, ok := n.bilingualPair()
	if !ok {
		return chatTurnTranslation{}, false
	}
	log := n.Fm.Log()
	orgId := n.Pipeline.GetOrgId()
	providerURL := n.Fm.GetOrgLlmProviderUrl(orgId)
	apiKey := n.Fm.GetOrgLlmProviderApiKey(orgId)
	if providerURL == "" || apiKey == "" {
		log.Warnf("AiAgentNode %s: bilingual chat without the organization's LLM provider URL or API key: not translated", n.NodeUid)
		return chatTurnTranslation{}, false
	}
	providerType := n.Fm.GetOrgLlmProviderType(orgId)
	model := chatTranslationModel(n.Fm.GetOrgLlmAllowedModels(orgId), providerURL)
	parent := n.Ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, chatTranslationTimeout)
	defer cancel()
	usageCtx, counter := llmusage.WithCounter(ctx)
	translator := &chatTranslator{ProviderURL: providerURL, APIKey: apiKey, Model: model, HTTPClient: llmusage.Client(0)}
	started := time.Now()
	tr, err := translator.Translate(usageCtx, primary, secondary, question, chatAnswerText(answer))
	n.recordLlmUsage(llmusage.SourceTranslator, userName, providerType, model, counter.Usage())
	if err != nil {
		log.Errorf("AiAgentNode %s: the turn of %s could not be translated (%s <-> %s): %v", n.NodeUid, userName, primary, secondary, err)
		n.publishAgentLog("warning", "Bilingual chat", "The answer could not be translated: "+err.Error())
		return chatTurnTranslation{}, false
	}
	log.Infof("AiAgentNode %s: turn of %s translated (%s <-> %s) in %s", n.NodeUid, userName, primary, secondary,
		time.Since(started).Round(time.Millisecond))
	return tr, true
}

// the translation of the last turn, until its answer is sent (one prompt at a time)
func (n *AiAgentNode) keepTranslation(userName string, tr chatTurnTranslation) {
	n.translationMu.Lock()
	defer n.translationMu.Unlock()
	n.translationUser, n.translation = userName, &tr
}

func (n *AiAgentNode) takeTranslation(userName string) (chatTurnTranslation, bool) {
	n.translationMu.Lock()
	defer n.translationMu.Unlock()
	tr, user := n.translation, n.translationUser
	n.translation, n.translationUser = nil, ""
	if tr == nil || user != userName {
		return chatTurnTranslation{}, false
	}
	return *tr, true
}
