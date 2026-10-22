package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

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

// SaveChatMessages appends messages, and the tool calls of each one, to
// a user's conversation, keeping the last maxChatMessagesPerUser.
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
) error {
	if userName == "" {
		return fmt.Errorf("userName cannot be empty")
	}
	if len(messages) == 0 {
		return fmt.Errorf("messages cannot be empty")
	}

	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	currentMessages, currentToolCallsArray, err := GetCurrentChatMessages(ctx, log, kvStore, key, userName)
	if err != nil {
		return fmt.Errorf("failed to retrieve current chat messages: %w", err)
	}

	updatedMessages := append(currentMessages, messages...)
	if len(updatedMessages) > maxChatMessagesPerUser {
		updatedMessages = updatedMessages[len(updatedMessages)-maxChatMessagesPerUser:]
	}
	updatedToolCallsArray := append(currentToolCallsArray, toolCallsArray...)
	if len(updatedToolCallsArray) > maxChatMessagesPerUser {
		updatedToolCallsArray = updatedToolCallsArray[len(updatedToolCallsArray)-maxChatMessagesPerUser:]
	}

	// The field names are the stored format's: the frontend and the
	// conversations already stored use them.
	chatAssistantMessages := map[string]interface{}{
		"ChatMessages":      updatedMessages,
		"McpToolCallsArray": updatedToolCallsArray,
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
	stored, err := kvStore.GetObjectValue(ctx, key)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return []StoredMessage{}, [][]ToolCall{}, nil
		}
		log.Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return nil, nil, err
	}

	// Through JSON: the KV store returns generic maps.
	raw, err := json.Marshal(stored)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid chat messages of user %s: %w", userName, err)
	}
	var data struct {
		ChatMessages      *[]StoredMessage `json:"ChatMessages"`
		McpToolCallsArray *[][]ToolCall    `json:"McpToolCallsArray"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, nil, fmt.Errorf("invalid chat messages of user %s: %w", userName, err)
	}
	if data.ChatMessages == nil {
		return nil, nil, fmt.Errorf("ChatMessages field not found in KV store data for user %s", userName)
	}
	if data.McpToolCallsArray == nil {
		return nil, nil, fmt.Errorf("McpToolCallsArray field not found in KV store data for user %s", userName)
	}
	messages := *data.ChatMessages
	toolCalls := *data.McpToolCallsArray
	// Keep them aligned (index i of one is index i of the other).
	for len(toolCalls) < len(messages) {
		toolCalls = append(toolCalls, nil)
	}
	return messages, toolCalls[len(toolCalls)-len(messages):], nil
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
