package nodes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"pipelines/message"
)

const (
	translatorDefaultModel    = "gpt-4o-mini"
	translatorChatCompletions = "/chat/completions"
)

type TranslatorNode struct {
	BaseNode
	TargetLanguage string
	ProviderURL    string
	Model          string
	APIKey         string
	httpClient     *http.Client
}

func CreateTranslatorNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TranslatorNode, error) {
	orgId := p.GetOrgId()
	providerUrl := fm.GetOrgLlmProviderUrl(orgId)
	providerApiKey := fm.GetOrgLlmProviderApiKey(orgId)
	groupId := p.GetGroupId()
	orgLlmEnabled := fm.GetOrgLlmEnabled(orgId)
	groupLlmEnabled := fm.GetGroupLlmEnabled(groupId)

	if !(orgLlmEnabled && groupLlmEnabled) {
		fm.Log().Errorf("TranslatorNode %s: LLM functionality is not enabled for the organization or group", node.NodeUid)
		return nil, fmt.Errorf("LLM functionality is not enabled for the organization or group")
	}

	if providerUrl == "" {
		fm.Log().Errorf("TranslatorNode %s: Url for LLM provider must be configured", node.NodeUid)
		return nil, fmt.Errorf("LLM provider URL must be configured")
	}

	if providerApiKey == "" {
		fm.Log().Errorf("TranslatorNode %s: API key must be configured", node.NodeUid)
		return nil, fmt.Errorf("API key must be configured")
	}

	targetLanguage, _ := node.Settings["targetLanguage"].(string)
	if targetLanguage == "" {
		targetLanguage = "English"
	}

	llmModel, _ := node.Settings["llmModel"].(string)
	if llmModel == "" {
		llmModel = translatorDefaultModel
	}
	if after, ok :=strings.CutPrefix(llmModel, "openai:"); ok  {
		llmModel = after
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &TranslatorNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Translator",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		TargetLanguage: targetLanguage,
		ProviderURL:    strings.TrimRight(providerUrl, "/"),
		Model:          llmModel,
		APIKey:         providerApiKey,
		httpClient:     &http.Client{},
	}, nil
}

func (n *TranslatorNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TranslatorNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TranslatorNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *TranslatorNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("TranslatorNode %s is already stopped", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()
	log.Infof("TranslatorNode %s stopped successfully", n.NodeUid)
}

func (n *TranslatorNode) processMessage(msg common.Message, log *logger.Logger) error {
	msgToTranslate, ok := msg.GetStringFromPayload("message")
	if !ok || msgToTranslate == "" {
		log.Infof("TranslatorNode %s: no 'message' field found, forwarding downstream", n.NodeUid)
		n.sendToOutputs(msg, log)
		return nil
	}

	log.Infof("TranslatorNode %s: translating message to %s", n.NodeUid, n.TargetLanguage)

	translated, err := n.translateText(n.Ctx, msgToTranslate, log)
	if err != nil {
		log.Errorf("TranslatorNode %s: failed to translate: %v", n.NodeUid, err)
		return fmt.Errorf("failed to translate: %w", err)
	}

	// Preserve any existing payload fields and add/overwrite translatedText.
	payload := msg.GetPayload()
	if payload == nil {
		payload = make(map[string]any)
	}
	payload["message"] = translated

	outMsg := message.NewMessageFromPayload(payload)
	n.sendToOutputs(outMsg, log)
	return nil
}

func (n *TranslatorNode) translateText(ctx context.Context, text string, log *logger.Logger) (string, error) {
	systemPrompt := fmt.Sprintf(
		"Translate the following text to %s. Return only the translation, no explanations.",
		n.TargetLanguage,
	)

	reqPayload := map[string]any{
		"model": n.Model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": text},
		},
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal translation request: %w", err)
	}

	url := n.ProviderURL + translatorChatCompletions
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create translation request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+n.APIKey)
	req.Header.Set("Content-Type", "application/json")

	log.Infof("TranslatorNode %s: calling %s (model: %s)", n.NodeUid, url, n.Model)

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
		return "", fmt.Errorf("empty translation response from provider")
	}

	log.Infof("TranslatorNode %s: translation complete", n.NodeUid)
	return result.Choices[0].Message.Content, nil
}