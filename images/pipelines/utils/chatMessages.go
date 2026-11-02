package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"pipelines/common"
	"pipelines/logger"
	nats_pkg "pipelines/nats"
)

type Response struct {
	Message string         `json:"message"`
	UiOpts  map[string]any `json:"uiOpts"`
}

type Email struct {
	EmailBody    string `json:"emailBody"`
	EmailSubject string `json:"emailSubject"`
}

type MessageType string

const (
	ResponseType MessageType = "response"
	EmailType    MessageType = "email"
	RawType      MessageType = "raw"
)

// ParsedMessage encapsula el resultado del parsing
type ParsedMessage struct {
	Type    MessageType
	Content interface{}
	Raw     string
}

// ToolCall is a tool the AI agent called while answering (shown in the
// chat).
type ToolCall struct {
	ToolName string `json:"tool_name"`
	Args     string `json:"args"`
}

type ChatMessage struct {
	Message      string     `json:"message"`
	UserName     string     `json:"userName"`
	Sender       string     `json:"sender"`
	Time         string     `json:"time"`
	McpToolCalls []ToolCall `json:"mcpToolCalls"`
	// Charts of the answer: references; the frontend asks for each image
	// (queryChatChart), which is kept apart (one NATS message is 1 MB).
	Charts []ChartRef `json:"charts,omitempty"`
}

// ChartRef is a chart of an answer, as the conversation keeps it: the
// image is in the digital twin's KV store, under its own key.
type ChartRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// StoredMessage is a message of a user's conversation with an AI agent,
// as it is kept in the digital twin's KV store: {"role": "user" |
// "assistant", "content": "..."}. Conversations stored before keep
// reading: they have the same two fields (other fields are ignored).
type StoredMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func GetChatMessages(
	ctx context.Context,
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	userName string,
	orgHash string,
	digitalTwinUid string,
) []StoredMessage {
	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	messages, _, err := GetCurrentChatMessages(ctx, log, kvStore, key, userName)
	if err != nil {
		log.Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return []StoredMessage{}
	}
	return messages
}

func GetFullChatMessageKvStoreKey(userName string, orgHash string, digitalTwinUid string) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.chat_messages.%s", orgHash, digitalTwinUid, userName)
}

// GetFullChatChartKvStoreKey is where a chart of a user's conversation is
// kept: a key per image (about 100 KB each), not in the conversation's.
func GetFullChatChartKvStoreKey(userName, orgHash, digitalTwinUid, chartId string) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.chat_charts.%s.%s", orgHash, digitalTwinUid, userName, chartId)
}

var chartIdRe = regexp.MustCompile(`^chart_[0-9a-f]{24}$`)

// IsChartID tells whether s is a chart id (chart_ and 24 hex digits).
func IsChartID(s string) bool { return chartIdRe.MatchString(s) }

// SaveChatChart keeps a chart of a user's conversation.
func SaveChatChart(ctx context.Context, kvStore *nats_pkg.KVStore, userName, orgHash, digitalTwinUid string, chart common.ChatChart) error {
	if !IsChartID(chart.ID) {
		return fmt.Errorf("invalid chart id %q", chart.ID)
	}
	return kvStore.SetValue(ctx, GetFullChatChartKvStoreKey(userName, orgHash, digitalTwinUid, chart.ID), chart)
}

// GetChatChart reads a chart of a user's conversation.
func GetChatChart(ctx context.Context, kvStore *nats_pkg.KVStore, userName, orgHash, digitalTwinUid, chartId string) (common.ChatChart, error) {
	var chart common.ChatChart
	if !IsChartID(chartId) {
		return chart, fmt.Errorf("invalid chart id %q", chartId)
	}
	err := kvStore.GetValue(ctx, GetFullChatChartKvStoreKey(userName, orgHash, digitalTwinUid, chartId), &chart)
	return chart, err
}

func deleteChatCharts(ctx context.Context, log *logger.Logger, kvStore *nats_pkg.KVStore, userName, orgHash, digitalTwinUid string, charts [][]ChartRef) {
	for _, refs := range charts {
		for _, ref := range refs {
			if !IsChartID(ref.ID) {
				continue
			}
			if err := kvStore.DeleteEntry(ctx, GetFullChatChartKvStoreKey(userName, orgHash, digitalTwinUid, ref.ID)); err != nil {
				log.Warnf("Chart %s of %s not deleted: %v", ref.ID, userName, err)
			}
		}
	}
}

// DeleteChatHistory deletes a user's conversation and its charts.
func DeleteChatHistory(ctx context.Context, log *logger.Logger, kvStore *nats_pkg.KVStore, userName, orgHash, digitalTwinUid string) error {
	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	if _, _, charts, err := GetChatHistory(ctx, log, kvStore, key, userName); err == nil {
		deleteChatCharts(ctx, log, kvStore, userName, orgHash, digitalTwinUid, charts)
	}
	return kvStore.DeleteEntry(ctx, key)
}

// SaveChatMessages appends messages, and the tool calls and charts of each
// one (chartsArray may be nil), to a user's conversation, keeping the last
// maxChatMessagesPerUser; the charts of the messages that go are deleted.
func SaveChatMessages(
	ctx context.Context,
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	userName string,
	orgHash string,
	digitalTwinUid string,
	maxChatMessagesPerUser int,
	messages []StoredMessage,
	toolCallsArray [][]ToolCall,
	chartsArray [][]ChartRef,
) error {
	if userName == "" {
		return fmt.Errorf("userName cannot be empty")
	}
	if len(messages) == 0 {
		return fmt.Errorf("messages cannot be empty")
	}

	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	currentMessages, currentToolCallsArray, currentCharts, err := GetChatHistory(ctx, log, kvStore, key, userName)
	if err != nil {
		return fmt.Errorf("failed to retrieve current chat messages: %w", err)
	}
	for len(toolCallsArray) < len(messages) {
		toolCallsArray = append(toolCallsArray, nil)
	}
	for len(chartsArray) < len(messages) {
		chartsArray = append(chartsArray, nil)
	}

	updatedMessages := append(currentMessages, messages...)
	updatedToolCallsArray := append(currentToolCallsArray, toolCallsArray[:len(messages)]...)
	updatedCharts := append(currentCharts, chartsArray[:len(messages)]...)
	if drop := len(updatedMessages) - maxChatMessagesPerUser; maxChatMessagesPerUser > 0 && drop > 0 {
		deleteChatCharts(ctx, log, kvStore, userName, orgHash, digitalTwinUid, updatedCharts[:drop])
		updatedMessages = updatedMessages[drop:]
		updatedToolCallsArray = updatedToolCallsArray[drop:]
		updatedCharts = updatedCharts[drop:]
	}

	// The field names are the stored format's: the frontend and the
	// conversations already stored use them (ChartsArray is new: older
	// conversations do not have it).
	chatAssistantMessages := map[string]interface{}{
		"ChatMessages":      updatedMessages,
		"McpToolCallsArray": updatedToolCallsArray,
		"ChartsArray":       updatedCharts,
	}
	if err := kvStore.SetValue(ctx, key, chatAssistantMessages); err != nil {
		return fmt.Errorf("failed to save chat messages for user %s: %w", userName, err)
	}
	return nil
}

// GetCurrentChatMessages reads a user's conversation and the tool calls
// of each message (the two lists have the same length).
func GetCurrentChatMessages(
	ctx context.Context,
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	key, userName string,
) ([]StoredMessage, [][]ToolCall, error) {
	messages, toolCalls, _, err := GetChatHistory(ctx, log, kvStore, key, userName)
	return messages, toolCalls, err
}

// GetChatHistory reads a user's conversation with the tool calls and the
// charts of each message (the three lists have the same length).
func GetChatHistory(
	ctx context.Context,
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	key, userName string,
) ([]StoredMessage, [][]ToolCall, [][]ChartRef, error) {
	stored, err := kvStore.GetObjectValue(ctx, key)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return []StoredMessage{}, [][]ToolCall{}, [][]ChartRef{}, nil
		}
		log.Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return nil, nil, nil, err
	}

	// Through JSON: the KV store returns generic maps.
	raw, err := json.Marshal(stored)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("invalid chat messages of user %s: %w", userName, err)
	}
	var data struct {
		ChatMessages      *[]StoredMessage `json:"ChatMessages"`
		McpToolCallsArray *[][]ToolCall    `json:"McpToolCallsArray"`
		ChartsArray       [][]ChartRef     `json:"ChartsArray"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, nil, nil, fmt.Errorf("invalid chat messages of user %s: %w", userName, err)
	}
	if data.ChatMessages == nil {
		return nil, nil, nil, fmt.Errorf("ChatMessages field not found in KV store data for user %s", userName)
	}
	if data.McpToolCallsArray == nil {
		return nil, nil, nil, fmt.Errorf("McpToolCallsArray field not found in KV store data for user %s", userName)
	}
	messages := *data.ChatMessages
	toolCalls := *data.McpToolCallsArray
	charts := data.ChartsArray
	// Keep them aligned (index i of one is index i of the others); the
	// conversations stored before the charts have none.
	for len(toolCalls) < len(messages) {
		toolCalls = append(toolCalls, nil)
	}
	if len(charts) > len(messages) {
		charts = charts[len(charts)-len(messages):]
	}
	for len(charts) < len(messages) {
		charts = append([][]ChartRef{nil}, charts...)
	}
	return messages, toolCalls[len(toolCalls)-len(messages):], charts, nil
}

func ParseMessage(messageStr string) ParsedMessage {
	descriptiveText, jsonContent := extractJSONFromMessage(messageStr)
	if jsonContent != "" {
		messageStr = jsonContent
	}

	// Primero verificamos si es un JSON válido
	var genericJSON map[string]interface{}
	if err := json.Unmarshal([]byte(messageStr), &genericJSON); err != nil {
		return ParsedMessage{
			Type:    RawType,
			Content: messageStr,
			Raw:     messageStr,
		}
	}

	// Verificamos si tiene la estructura de Response
	if hasFields(genericJSON, []string{"message"}) {
		var response Response
		if err := json.Unmarshal([]byte(messageStr), &response); err == nil {
			if descriptiveText != "" {
				response.Message = fmt.Sprintf("%s %s", response.Message, descriptiveText)
			}
			return ParsedMessage{
				Type:    ResponseType,
				Content: response,
				Raw:     messageStr,
			}
		}
	}

	// Verificamos si tiene la estructura de Email
	if hasFields(genericJSON, []string{"emailBody", "emailSubject"}) {
		var email Email
		if err := json.Unmarshal([]byte(messageStr), &email); err == nil {
			return ParsedMessage{
				Type:    EmailType,
				Content: email,
				Raw:     messageStr,
			}
		}
	}

	// Si no coincide con ningún formato conocido, devolvemos el JSON genérico
	return ParsedMessage{
		Type:    RawType,
		Content: genericJSON,
		Raw:     messageStr,
	}
}

// hasFields verifica si un map contiene todos los campos requeridos
func hasFields(data map[string]interface{}, fields []string) bool {
	for _, field := range fields {
		if _, exists := data[field]; !exists {
			return false
		}
	}
	return true
}

// ExtractJSONFromMessage extrae un bloque de código JSON de un mensaje de entrada
func extractJSONFromMessage(input string) (string, string) {
	jsonBlockRegex := regexp.MustCompile("```json\\s*\\n([\\s\\S]*?)\\n```")

	matches := jsonBlockRegex.FindStringSubmatch(input)
	if len(matches) != 2 {
		return "", ""
	}

	jsonContent := strings.TrimSpace(matches[1])

	// Extraer el texto descriptivo (todo lo que está antes del bloque JSON)
	descriptiveText := strings.TrimSpace(jsonBlockRegex.ReplaceAllString(input, ""))

	return descriptiveText, jsonContent
}

// CreateCommonMessage convierte el ParsedMessage a common.Message
func CreateCommonMessage(parsed ParsedMessage, mcpToolCalls []ToolCall) map[string]interface{} {
	basePayload := map[string]interface{}{
		"messageType":  string(parsed.Type),
		"mcpToolCalls": mcpToolCalls,
	}

	switch parsed.Type {
	case ResponseType:
		if response, ok := parsed.Content.(Response); ok {
			basePayload["message"] = response.Message
			basePayload["uiOpts"] = response.UiOpts
			basePayload["eventTriggerTopicType"] = "llm2sim"
		}
	case EmailType:
		if email, ok := parsed.Content.(Email); ok {
			basePayload["emailBody"] = email.EmailBody
			basePayload["emailSubject"] = email.EmailSubject
		}
	case RawType:
		basePayload["message"] = parsed.Raw
		basePayload["eventTriggerTopicType"] = "llm2sim"
	}

	return basePayload
}
