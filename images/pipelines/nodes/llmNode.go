package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/nats"
	"pipelines/utils"

	"github.com/cloudwego/eino/schema"
	"github.com/osi4iot/mcphost/pkg/mcphost"
)

type LlmNode struct {
	BaseNode
	InputChan  chan mcphost.ChatMessage
	OutputChan chan mcphost.LlmResponse
	McpHost    mcphost.MCPHost
}

type Response struct {
	Message string         `json:"message"`
	UiOpts  map[string]any `json:"uiOpts"`
}

func CreateLlmNode(node common.NodeData, fm common.Manager) (*LlmNode, error) {
	systemPrompt, ok := node.Settings["systemPrompt"].(string)
	if !ok {
		fm.Log().Errorf("LlmNode %s: 'systemPrompt' setting is required and must be a non-empty string", node.NodeUid)
		return nil, fmt.Errorf("systemPrompt setting is required and must be a non-empty string")
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	inputChan := make(chan mcphost.ChatMessage)
	outputChan := make(chan mcphost.LlmResponse)
	mcpServersPath := fm.GetMcpServersPath()

	mcpServers := map[string]mcphost.MCPServerConfig{
		"filesystem": {
			Type: "builtin",
			Name: "fs",
			Options: map[string]any{
				"allowed_directories": []string{"/home/daniel/Escritorio", filepath.Join(mcpServersPath, "chroma")},
			},
		},
		// "task-manager": {
		// 	Type: "builtin",
		// 	Name: "todo",
		// },
		// "web-fetcher": {
		// 	Type: "builtin",
		// 	Name: "http",
		// },
		"current_date": {
			Type:    "local",
			Command: []string{filepath.Join(mcpServersPath, "current_date", "current_date")},
			Args:    []string{},
		},
		"calculate_expression1": {
			Type:    "local",
			Command: []string{"uv"},
			Args: []string{
				"run",
				"--directory",
				filepath.Join(mcpServersPath, "mcp_calculate_server"),
				"server.py",
			},
		},
		"chroma": {
			Type:    "local",
			Command: []string{"uvx"},
			Args: []string{
				"chroma-mcp",
				"--client-type",
				"persistent",
				"--data-dir",
				filepath.Join(mcpServersPath, "chroma"),
			},
		},
	}

	femResultsInfo := fm.GetFemResultsInfo(node.GroupId, node.DigitalTwinId)
	if len(femResultsInfo) > 0 && digitalTwin.ChatAssistantEnabled{
		femResultsPath := fm.GetFemResultsPath()
		orgId := fmt.Sprintf("org_%d", node.OrgId)
		groupId := fmt.Sprintf("group_%d", node.GroupId)
		digitalTwinId := fmt.Sprintf("dt_%d", node.DigitalTwinId)
		mcpServers["fem_results"] = mcphost.MCPServerConfig{
			Type:    "local",
			Command: []string{filepath.Join(mcpServersPath, "fem_results", "fem_results")},
			Args:    []string{"--results_path", filepath.Join(femResultsPath, orgId, groupId, digitalTwinId)},
		}
	}

	var temperature float32 = 0.7
	var topP float32 = 0.95
	var topK int32 = 40
	debug := false
	if fm.GetMode() == "debug" {
		debug = true
	}

	hostConfig := &mcphost.HostConfig{
		NatsClient:     fm.GetNatsClient(),
		MCPServers:     mcpServers,
		Model:          fm.GetLlmModel(),
		MaxSteps:       100,
		Debug:          debug,
		SystemPrompt:   systemPrompt,
		ProviderAPIKey: fm.GetLlmProviderApiKey(),
		ProviderURL:    fm.GetLlmProviderUrl(),
		MaxTokens:      fm.GetLlmMaxTokens(),
		Temperature:    &temperature,
		TopP:           &topP,
		TopK:           &topK,
		SavedMessages:  nil, // This will be populated later
		InputChan:      inputChan,
		OutputChan:     outputChan,
	}

	ctx, cancel := context.WithCancel(context.Background())
	llmNNode := &LlmNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "LLM",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		InputChan:  inputChan,
		OutputChan: outputChan,
	}

	newMcpHost, err := mcphost.NewMCPHost(hostConfig, llmNNode.GetChatMessages, llmNNode.SaveChatMessages)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP host: %w", err)
	}
	llmNNode.McpHost = newMcpHost

	return llmNNode, nil
}

func (n *LlmNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("LLMNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting LLMNode with UID: %s", n.NodeUid)
	go func() {
		if err := n.McpHost.Run(); err != nil {
			log.Errorf("MCP Host error: %v", err)
			n.HandleError(err)
			return
		}
	}()

	n.handleInputWires(log, n.sendPromptToMcpHost)
	n.handleMcpHostMessage(log)
}

func (n *LlmNode) sendPromptToMcpHost(msg mcphost.ChatMessage, log *logger.Logger) error {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("LlmNode %s stopped during delay, discarding message", n.NodeUid)
		return nil
	}

	n.InputChan <- msg

	return nil
}

func (n *LlmNode) handleInputWires(log *logger.Logger, processor func(mcphost.ChatMessage, *logger.Logger) error) {
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)
	if len(nodeInputWires) == 0 {
		return
	}

	for i, wire := range nodeInputWires {
		n.wg.Add(1)
		go func(channelIndex int, inputWire *common.Wire) {
			defer n.wg.Done()
			defer func() {
				log.Infof("Node channel %d goroutine terminated for UID: %s", channelIndex, n.NodeUid)
			}()

			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping Node channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel %d closed for Node with UID: %s", channelIndex, n.NodeUid)
						return
					}

					if n.GetStatus() != common.NodeStatusRunning {
						log.Infof("Node %s not running, discarding message on channel %d", n.NodeUid, channelIndex)
						continue
					}

					userName := msg.Payload["userName"].(string)
					prompt := msg.Payload["message"].(string)
					chatMessage := mcphost.ChatMessage{
						UserName: userName,
						Prompt:   prompt,
					}
					if err := processor(chatMessage, log); err != nil {
						n.HandleError(err)
					}
				}
			}
		}(i, wire)
	}
}

func (n *LlmNode) handleMcpHostMessage(log *logger.Logger) error {
	n.wg.Add(1)
	defer n.wg.Done()
	go func() {
		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping MCP host for Node with UID: %s", n.NodeUid)
				return
			case msg, ok := <-n.OutputChan:
				if !ok {
					log.Infof("Channel closed for Node with UID: %s", n.NodeUid)
					return
				}

				if msg.Status == "error" {
					errMsg := fmt.Errorf("MCP Host error: %s", msg.Message)
					log.Errorf("MCP Host error: %v", errMsg)
					n.HandleError(errMsg)
					return
				} else {
					var message common.Message
					var response Response
					err := json.Unmarshal([]byte(msg.Message), &response)
					if err != nil {
						message = common.Message{
							Payload: map[string]interface{}{
								"message": msg.Message,
							},
						}
					} else {
						message = common.Message{
							Payload: map[string]interface{}{
								"message":               response.Message,
								"uiOpts":                response.UiOpts,
								"eventTriggerTopicType": "llm2sim",
							},
						}
					}

					n.sendToOutputs(message, log)
				}

			}
		}
	}()

	return nil
}

func (n *LlmNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.McpHost.Close()
		n.Cancel()
	}

	n.wg.Wait() //Wait for all goroutines to finish

	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *LlmNode) GetChatMessages(userName string) []*schema.Message {
	kvStore := n.Fm.GetDigitalTwinKvStore(n.DigitalTwinId)
	if kvStore == nil {
		n.Fm.Log().Errorf("Failed to get KV store for digital twin %d", n.DigitalTwinId)
		return nil
	}

	key := n.getFullChatMessageKvStoreKey(userName)
	chatMessageArray, err := kvStore.GetArrayValue(context.Background(), key)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return []*schema.Message{} // Retornar slice vacío si no existe la key
		}
		n.Fm.Log().Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return []*schema.Message{}
	}

	var chatMessages []*schema.Message
	for i, msg := range chatMessageArray {
		chatMsg := n.convertToMessage(msg, userName, i)
		if chatMsg != nil {
			chatMessages = append(chatMessages, chatMsg)
		}
	}

	return chatMessages
}

func (n *LlmNode) SaveChatMessages(userName string, messages []*schema.Message) error {
	// 1. Validar entrada y obtener KV store
	if err := n.validateSaveChatInput(userName, messages); err != nil {
		return err
	}

	kvStore := n.Fm.GetDigitalTwinKvStore(n.DigitalTwinId)
	if kvStore == nil {
		return fmt.Errorf("failed to get KV store for digital twin %d", n.DigitalTwinId)
	}

	// 2. Obtener mensajes existentes
	key := n.getFullChatMessageKvStoreKey(userName)
	currentMessages, err := n.getCurrentChatMessages(kvStore, key, userName)
	if err != nil {
		return fmt.Errorf("failed to retrieve current chat messages: %w", err)
	}

	// 3. Agregar nuevos mensajes
	updatedMessages := n.appendNewMessages(currentMessages, messages)
	if len(updatedMessages) > n.Fm.GetMaxChatMessagesPerUser() {
		updatedMessages = updatedMessages[len(updatedMessages)-n.Fm.GetMaxChatMessagesPerUser():]
	}

	// 4. Guardar mensajes actualizados
	if err := kvStore.SetValue(context.Background(), key, updatedMessages); err != nil {
		return fmt.Errorf("failed to save chat messages for user %s: %w", userName, err)
	}

	return nil
}

// validateSaveChatInput valida los parámetros de entrada
func (n *LlmNode) validateSaveChatInput(userName string, messages []*schema.Message) error {
	if userName == "" {
		return fmt.Errorf("userName cannot be empty")
	}
	if len(messages) == 0 {
		return fmt.Errorf("messages cannot be empty")
	}
	return nil
}

// getCurrentChatMessages obtiene los mensajes de chat existentes del KV store
func (n *LlmNode) getCurrentChatMessages(kvStore *nats.KVStore, key, userName string) ([]schema.Message, error) {
	arrayValue, err := kvStore.GetArrayValue(context.Background(), key)
	if err != nil {
		if err.Error() == fmt.Sprintf("key %s not found", key) {
			return make([]schema.Message, 0), nil
		}
		n.Fm.Log().Errorf("Failed to get chat messages for user %s: %v", userName, err)
		return nil, err
	}

	// Convertir valores del array a mensajes
	currentMessages := make([]schema.Message, 0, len(arrayValue))
	for i, msg := range arrayValue {
		if chatMsg := n.convertToMessageValue(msg, userName, i); chatMsg != nil {
			currentMessages = append(currentMessages, *chatMsg)
		}
	}

	return currentMessages, nil
}

// appendNewMessages agrega los nuevos mensajes a la lista existente
func (n *LlmNode) appendNewMessages(currentMessages []schema.Message, newMessages []*schema.Message) []schema.Message {
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
func (n *LlmNode) convertToMessage(msg interface{}, userName string, index int) *schema.Message {
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
		return n.convertMapToMessage(msgMap, userName, index)
	}

	// Método 4: Intentar deserialización JSON como último recurso
	if jsonBytes, err := json.Marshal(msg); err == nil {
		var chatMsg schema.Message
		if err := json.Unmarshal(jsonBytes, &chatMsg); err == nil {
			return &chatMsg
		}
	}

	n.Fm.Log().Warnf("Failed to convert message at index %d for user %s, type: %T", index, userName, msg)
	return nil
}

// convertToMessageValue es similar a convertToMessage pero retorna valor en lugar de puntero
func (n *LlmNode) convertToMessageValue(msg interface{}, userName string, index int) *schema.Message {
	return n.convertToMessage(msg, userName, index)
}

// convertMapToMessage convierte un map[string]interface{} a schema.Message
func (n *LlmNode) convertMapToMessage(msgMap map[string]interface{}, userName string, index int) *schema.Message {
	// Método preferido: usar JSON marshaling/unmarshaling para manejar todos los campos y tipos complejos
	jsonBytes, err := json.Marshal(msgMap)
	if err != nil {
		n.Fm.Log().Errorf("Failed to marshal message map for user %s at index %d: %v", userName, index, err)
		return nil
	}

	var message schema.Message
	if err := json.Unmarshal(jsonBytes, &message); err != nil {
		n.Fm.Log().Errorf("Failed to unmarshal message for user %s at index %d: %v", userName, index, err)
		// Intentar mapeo manual como fallback
		return n.manualMapToMessage(msgMap)
	}

	return &message
}

// manualMapToMessage mapeo manual como fallback si falla JSON unmarshaling
func (n *LlmNode) manualMapToMessage(msgMap map[string]interface{}) *schema.Message {
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

func (n *LlmNode) getFullChatMessageKvStoreKey(userName string) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.chat_messages.%s", n.GetOrgHash(), n.GetDigitalTwinUID(), userName)
}
