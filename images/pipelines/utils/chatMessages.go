package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/cloudwego/eino/schema"
	"github.com/osi4iot/mcphost/pkg/mcphost"

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

type ChatMessage struct {
	Message      string                `json:"message"`
	UserName     string                `json:"userName"`
	Sender       string                `json:"sender"`
	Time         string                `json:"time"`
	McpToolCalls []mcphost.McpToolCall `json:"mcpToolCalls"`
}

func GetChatMessages(
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	userName string,
	orgHash string,
	digitalTwinUid string,
) []*schema.Message {
	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	currentMessages, _, err := GetCurrentChatMessages(log, kvStore, key, userName)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return []*schema.Message{} // Retornar slice vacío si no existe la key
		}
		log.Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return []*schema.Message{}
	}

	var chatMessages []*schema.Message
	for i, msg := range currentMessages {
		chatMsg := convertToMessage(log, msg, userName, i)
		if chatMsg != nil {
			chatMessages = append(chatMessages, chatMsg)
		}
	}

	return chatMessages
}

func GetFullChatMessageKvStoreKey(userName string, orgHash string, digitalTwinUid string) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.chat_messages.%s", orgHash, digitalTwinUid, userName)
}

func SaveChatMessages(
	log *logger.Logger,
	kvStore *nats_pkg.KVStore,
	userName string,
	orgHash string,
	digitalTwinUid string,
	maxChatMessagesPerUser int,
	messages []*schema.Message,
	mcpToolCallsArray [][]mcphost.McpToolCall,
) error {
	// 1. Validar entrada
	if err := validateSaveChatInput(userName, messages); err != nil {
		return err
	}

	// 2. Obtener mensajes existentes
	key := GetFullChatMessageKvStoreKey(userName, orgHash, digitalTwinUid)
	currentMessages, currentMcpToolCallsArray, err := GetCurrentChatMessages(log, kvStore, key, userName)
	if err != nil {
		return fmt.Errorf("failed to retrieve current chat messages: %w", err)
	}

	// 3. Agregar nuevos mensajes
	updatedMessages := appendNewMessages(currentMessages, messages)
	if len(updatedMessages) > maxChatMessagesPerUser {
		updatedMessages = updatedMessages[len(updatedMessages)-maxChatMessagesPerUser:]
	}

	updatedMcpToolCallsArray := append(currentMcpToolCallsArray, mcpToolCallsArray...)
	if len(updatedMcpToolCallsArray) > maxChatMessagesPerUser {
		updatedMcpToolCallsArray = updatedMcpToolCallsArray[len(updatedMcpToolCallsArray)-maxChatMessagesPerUser:]
	}

	// Preparar estructura para guardar
	chatAssistantMessages := map[string]interface{}{
		"ChatMessages":      updatedMessages,
		"McpToolCallsArray": updatedMcpToolCallsArray,
	}

	// 4. Guardar mensajes actualizados
	if err := kvStore.SetValue(context.Background(), key, chatAssistantMessages); err != nil {
		return fmt.Errorf("failed to save chat messages for user %s: %w", userName, err)
	}

	return nil
}

// validateSaveChatInput valida los parámetros de entrada
func validateSaveChatInput(userName string, messages []*schema.Message) error {
	if userName == "" {
		return fmt.Errorf("userName cannot be empty")
	}
	if len(messages) == 0 {
		return fmt.Errorf("messages cannot be empty")
	}
	return nil
}

// getCurrentChatMessages obtiene los mensajes de chat existentes del KV store
func GetCurrentChatMessages(log *logger.Logger, kvStore *nats_pkg.KVStore, key, userName string) ([]schema.Message, [][]mcphost.McpToolCall, error) {
	chatAssistanMessages, err := kvStore.GetObjectValue(context.Background(), key)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return make([]schema.Message, 0), nil, nil
		}
		log.Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return nil, nil, err
	}

	chatMessagesValue, ok1 := chatAssistanMessages["ChatMessages"].([]interface{})
	mcpToolsCallsValue, ok2 := chatAssistanMessages["McpToolCallsArray"].([]interface{})

	if !ok1 {
		return nil, nil, fmt.Errorf("ChatMessages field not found in KV store data for user %s", userName)
	}

	if !ok2 {
		return nil, nil, fmt.Errorf("McpToolCallsArray field not found in KV store data for user %s", userName)
	}

	// Convertir valores del array a mensajes
	currentMessages := make([]schema.Message, 0, len(chatMessagesValue))
	for i, msg := range chatMessagesValue {
		if chatMsg := convertToMessageValue(log, msg, userName, i); chatMsg != nil {
			currentMessages = append(currentMessages, *chatMsg)
		}
	}

	currentMcpToolCallsArray := make([][]mcphost.McpToolCall, 0, len(mcpToolsCallsValue))
	for i, item := range mcpToolsCallsValue {
		// Caso 1: item es nil
		if item == nil {
			currentMcpToolCallsArray = append(currentMcpToolCallsArray, nil)
			continue
		}

		// Caso 2: item es un array
		if callsSlice, ok := item.([]interface{}); ok {
			var calls []mcphost.McpToolCall
			for j, callItem := range callsSlice {
				if callItem == nil {
					calls = append(calls, mcphost.McpToolCall{})
					continue
				}
				if callMap, ok := callItem.(map[string]interface{}); ok {
					callBytes, err := json.Marshal(callMap)
					if err != nil {
						log.Errorf("Failed to marshal McpToolCall at index %d,%d for user %s: %v", i, j, userName, err)
						continue
					}
					var call mcphost.McpToolCall
					if err := json.Unmarshal(callBytes, &call); err != nil {
						log.Errorf("Failed to unmarshal McpToolCall at index %d,%d for user %s: %v", i, j, userName, err)
						continue
					}
					calls = append(calls, call)
				}
			}
			currentMcpToolCallsArray = append(currentMcpToolCallsArray, calls)
		} else {
			log.Warnf("McpToolCallsArray item at index %d for user %s is not an array or nil", i, userName)
		}
	}

	return currentMessages, currentMcpToolCallsArray, nil
}

// appendNewMessages agrega los nuevos mensajes a la lista existente
func appendNewMessages(currentMessages []schema.Message, newMessages []*schema.Message) []schema.Message {
	// Pre-asignar capacidad para evitar realocaciones
	updatedMessages := make([]schema.Message, len(currentMessages), len(currentMessages)+len(newMessages))
	copy(updatedMessages, currentMessages)

	// Agregar nuevos mensajes desreferenciando los punteros
	for _, msg := range newMessages {
		if msg != nil {
			updatedMessages = append(updatedMessages, *msg)
		}
	}

	return updatedMessages
}

// convertToMessage convierte un valor del KV store a *schema.Message
func convertToMessage(log *logger.Logger, msg interface{}, userName string, index int) *schema.Message {
	// Método 1: Intentar conversión directa (si el tipo coincide)
	if chatMsg, ok := msg.(schema.Message); ok {
		return &chatMsg
	}

	// Método 2: Intentar conversión desde puntero
	if chatMsg, ok := msg.(*schema.Message); ok {
		return chatMsg
	}

	// Método 3: Convertir desde map[string]interface{} (caso más común)
	if msgMap, ok := msg.(map[string]interface{}); ok {
		return convertMapToMessage(log, msgMap, userName, index)
	}

	// Método 4: Intentar deserialización JSON como último recurso
	if jsonBytes, err := json.Marshal(msg); err == nil {
		var chatMsg schema.Message
		if err := json.Unmarshal(jsonBytes, &chatMsg); err == nil {
			return &chatMsg
		}
	}

	log.Warnf("Failed to convert message at index %d for user %s, type: %T", index, userName, msg)
	return nil
}

// convertToMessageValue es similar a convertToMessage pero retorna valor en lugar de puntero
func convertToMessageValue(log *logger.Logger, msg interface{}, userName string, index int) *schema.Message {
	return convertToMessage(log, msg, userName, index)
}

// convertMapToMessage convierte un map[string]interface{} a schema.Message
func convertMapToMessage(log *logger.Logger, msgMap map[string]interface{}, userName string, index int) *schema.Message {
	// Método preferido: usar JSON marshaling/unmarshaling para manejar todos los campos y tipos complejos
	jsonBytes, err := json.Marshal(msgMap)
	if err != nil {
		log.Errorf("Failed to marshal message map for user %s at index %d: %v", userName, index, err)
		return nil
	}

	var message schema.Message
	if err := json.Unmarshal(jsonBytes, &message); err != nil {
		log.Errorf("Failed to unmarshal message for user %s at index %d: %v", userName, index, err)
		// Intentar mapeo manual como fallback
		return manualMapToMessage(msgMap)
	}

	return &message
}

// manualMapToMessage mapeo manual como fallback si falla JSON unmarshaling
func manualMapToMessage(msgMap map[string]interface{}) *schema.Message {
	message := &schema.Message{}

	// Role (RoleType)
	if role, ok := msgMap["role"].(string); ok {
		message.Role = schema.RoleType(role)
	} else if roleFloat, ok := msgMap["role"].(float64); ok {
		message.Role = schema.RoleType(fmt.Sprintf("%.0f", roleFloat))
	}

	// Content
	if content, ok := msgMap["content"].(string); ok {
		message.Content = content
	}

	// MultiContent - array de ChatMessagePart
	if multiContent, ok := msgMap["multi_content"].([]interface{}); ok && len(multiContent) > 0 {
		for _, part := range multiContent {
			if partMap, ok := part.(map[string]interface{}); ok {
				// Convertir cada parte usando JSON marshaling
				partBytes, err := json.Marshal(partMap)
				if err == nil {
					var chatPart schema.ChatMessagePart
					if json.Unmarshal(partBytes, &chatPart) == nil {
						message.MultiContent = append(message.MultiContent, chatPart)
					}
				}
			}
		}
	}

	// Name
	if name, ok := msgMap["name"].(string); ok {
		message.Name = name
	}

	// ToolCalls - array de ToolCall
	if toolCalls, ok := msgMap["tool_calls"].([]interface{}); ok && len(toolCalls) > 0 {
		for _, call := range toolCalls {
			if callMap, ok := call.(map[string]interface{}); ok {
				// Convertir cada tool call usando JSON marshaling
				callBytes, err := json.Marshal(callMap)
				if err == nil {
					var toolCall schema.ToolCall
					if json.Unmarshal(callBytes, &toolCall) == nil {
						message.ToolCalls = append(message.ToolCalls, toolCall)
					}
				}
			}
		}
	}

	// ToolCallID
	if toolCallID, ok := msgMap["tool_call_id"].(string); ok {
		message.ToolCallID = toolCallID
	}

	// ToolName
	if toolName, ok := msgMap["tool_name"].(string); ok {
		message.ToolName = toolName
	}

	// ResponseMeta
	if responseMeta, ok := msgMap["response_meta"].(map[string]interface{}); ok {
		metaBytes, err := json.Marshal(responseMeta)
		if err == nil {
			var meta schema.ResponseMeta
			if json.Unmarshal(metaBytes, &meta) == nil {
				message.ResponseMeta = &meta
			}
		}
	}

	// Extra - map[string]any
	if extra, ok := msgMap["extra"].(map[string]interface{}); ok {
		message.Extra = make(map[string]any)
		for k, v := range extra {
			message.Extra[k] = v
		}
	}

	return message
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
func CreateCommonMessage(parsed ParsedMessage, mcpToolCalls []mcphost.McpToolCall) map[string]interface{} {
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
