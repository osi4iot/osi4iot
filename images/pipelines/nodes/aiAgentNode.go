package nodes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"github.com/cloudwego/eino/schema"
	"github.com/osi4iot/mcphost/pkg/mcphost"
)

type AiAgentNode struct {
	BaseNode
	LlmModel       string
	LlmTemperature float64
	InputChan      chan mcphost.ChatMessage
	OutputChan     chan mcphost.LlmResponse
	McpHost        mcphost.MCPHost
}

func CreateAiAgentNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*AiAgentNode, error) {
	orgId := p.GetOrgId()
	providerUrl := fm.GetOrgLlmProviderUrl(orgId)
	providerApiKey := fm.GetOrgLlmProviderApiKey(orgId)
	groupId := p.GetGroupId()
	orgLlmEnabled := fm.GetOrgLlmEnabled(orgId)
	groupLlmEnabled := fm.GetGroupLlmEnabled(groupId)

	if !(orgLlmEnabled && groupLlmEnabled) {
		fm.Log().Errorf("AI Agent Node %s: LLM functionality is not enabled for the organization or group", node.NodeUid)
		return nil, fmt.Errorf("LLM functionality is not enabled for the organization or group")
	}

	if providerUrl == "" || providerApiKey == "" {
		fm.Log().Errorf("AI Agent Node %s: LLM provider URL and API key must be configured", node.NodeUid)
		return nil, fmt.Errorf("LLM provider URL and API key must be configured")
	}

	llmModel, ok := node.Settings["llmModel"].(string)
	if !ok {
		llmModel = fm.GetDefaultLlmModel()
	}

	llmTemperature, ok := node.Settings["llmTemperature"].(float32)
	if !ok {
		llmTemperature = fm.GetDefaultLlmTemperature()
	}

	var llmTopK int32 = 40
	llmTopKFloat64, ok := node.Settings["llmTopK"].(float64)
	if !ok {
		llmTopK = fm.GetDefaultLlmTopK()
	} else {
		llmTopK = int32(llmTopKFloat64)
	}

	var llmTopP float32 = 0.95
	llmTopPFloat64, ok := node.Settings["llmTopP"].(float64)
	if !ok {
		llmTopP = fm.GetDefaultLlmTopP()
	} else {
		llmTopP = float32(llmTopPFloat64)
	}

	systemPrompt, ok := node.Settings["systemPrompt"].(string)
	if !ok {
		fm.Log().Errorf("AiAgentNode %s: 'systemPrompt' setting is required and must be a non-empty string", node.NodeUid)
		return nil, fmt.Errorf("systemPrompt setting is required and must be a non-empty string")
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	inputChan := make(chan mcphost.ChatMessage)
	outputChan := make(chan mcphost.LlmResponse)
	mcpServersPath := fm.GetMcpServersPath()
	dtPath := fm.GetDigitalTwinFolder(p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
	fileSystemPath := filepath.Join(dtPath, "filesystem")
	utils.CreateDirectoryIfNotExists(fileSystemPath)

	mcpServers := map[string]mcphost.MCPServerConfig{
		"filesystem": {
			Type: "builtin",
			Name: "fs",
			Options: map[string]any{
				"allowed_directories": []string{fileSystemPath},
			},
		},
	}

	femResultsInfo := fm.GetS3DigitalTwinFolderInfo(p.GetGroupId(), p.GetDigitalTwinId(), "femResFiles")
	if fm.GetMode() == "local" {
		mcpServers["current_date"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "current_date",
			Command: []string{filepath.Join(mcpServersPath, "current_date", "current_date")},
			Args:    []string{},
		}

		mcpServers["calculate_expression1"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "calculate_expression1",
			Command: []string{"uv"},
			Args: []string{
				"run",
				"--directory",
				filepath.Join(mcpServersPath, "mcp_calculate_server"),
				"server.py",
			},
		}

		if len(femResultsInfo) > 0 {
			femResultsPath := fm.GetFemResultsPath(p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
			utils.CreateDirectoryIfNotExists(femResultsPath)
			if femResultsPath != "" {
				mcpServers["fem_results"] = mcphost.MCPServerConfig{
					Type:    "local",
					Name:    "fem_results",
					Command: []string{filepath.Join(mcpServersPath, "fem_results", "fem_results")},
					Args:    []string{"--results_path", femResultsPath},
				}
			}
		}
	} else {
		mcpServers["current_date"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "current_date",
			Command: []string{"/usr/local/bin/current_date"},
			Args:    []string{},
		}

		mcpServers["calculate_expression1"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "calculate_expression1",
			Command: []string{"/opt/venv/bin/python"},
			Args:    []string{"-m", "server"},
		}

		if len(femResultsInfo) > 0 {
			femResultsPath := fm.GetFemResultsPath(p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
			utils.CreateDirectoryIfNotExists(femResultsPath)
			if femResultsPath != "" {
				mcpServers["fem_results"] = mcphost.MCPServerConfig{
					Type:    "local",
					Name:    "fem_results",
					Command: []string{"/usr/local/bin/fem_results"},
					Args:    []string{"--results_path", femResultsPath},
				}
			}
		}
	}

	debug := false
	if fm.GetMode() == "local" {
		debug = true
	}

	switch providerUrl {
	case "https://api.openai.com/v1":
		if strings.Contains(llmModel, "gpt-5") {
			providerUrl = ""
		}
	case "https://api.groq.com/openai/v1":
		llmModel = strings.ReplaceAll(llmModel, "openai:", "openai:openai/")
	}

	hostConfig := &mcphost.HostConfig{
		NatsClient:     fm.GetNatsClient(),
		MCPServers:     mcpServers,
		Model:          llmModel,
		MaxSteps:       500,
		Debug:          debug,
		SystemPrompt:   systemPrompt,
		ProviderAPIKey: providerApiKey,
		ProviderURL:    providerUrl,
		MaxTokens:      fm.GetLlmMaxTokens(),
		Temperature:    &llmTemperature,
		TopP:           &llmTopP,
		TopK:           &llmTopK,
		SavedMessages:  nil, // This will be populated later
		InputChan:      inputChan,
		OutputChan:     outputChan,
	}

	ctx, cancel := context.WithCancel(context.Background())
	aiAgentNode := &AiAgentNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "AiAgent",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		InputChan:  inputChan,
		OutputChan: outputChan,
	}

	newMcpHost, err := mcphost.NewMCPHost(hostConfig, ctx, aiAgentNode.GetChatMessages, aiAgentNode.SaveChatMessages)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP host: %w", err)
	}
	aiAgentNode.McpHost = newMcpHost

	return aiAgentNode, nil
}

func (n *AiAgentNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("AiAgentNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting AiAgentNode with UID: %s", n.NodeUid)

	// Registrar la goroutine en el WaitGroup
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer func() {
			log.Infof("MCP Host goroutine terminated for UID: %s", n.NodeUid)
		}()

		if err := n.McpHost.Run(); err != nil {
			if !errors.Is(err, context.Canceled) {
				n.handleMCPHostError(err)
				n.McpHost.Close()
				return
			} else {
				log.Infof("MCP Host stopped gracefully due to context cancellation")
				return
			}
		}
	}()

	n.handleInputWires(log, n.sendPromptToMcpHost)
	n.handleMcpHostMessage(log)
}

func (n *AiAgentNode) sendPromptToMcpHost(msg mcphost.ChatMessage, log *logger.Logger) error {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("AiAgentNode %s stopped during delay, discarding message", n.NodeUid)
		return nil
	}

	n.InputChan <- msg

	return nil
}

func (n *AiAgentNode) handleInputWires(log *logger.Logger, processor func(mcphost.ChatMessage, *logger.Logger) error) {
	nodeInputWires := n.GetNodeInputWires()
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

					var userName, prompt string
					userName, ok = msg.Payload["userName"].(string)
					if !ok || userName == "" {
						userName = "unknown"
					}
					prompt, ok = msg.Payload["message"].(string)
					if !ok || prompt == "" {
						prompt = "no prompt"
					}
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

func (n *AiAgentNode) handleMcpHostMessage(log *logger.Logger) error {
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
					n.handleMCPHostError(errMsg)
					n.McpHost.Close()
					n.Cancel()
					n.Pipeline.RestartNode(n.NodeUid)
					return
				} else {
					parsed := utils.ParseMessage(msg.Message)
					payload := utils.CreateCommonMessage(parsed, msg.McpToolCalls)

					message := common.Message{
						Payload: payload,
					}

					n.sendToOutputs(message, log)
				}

			}
		}
	}()

	return nil
}

func (n *AiAgentNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		return
	}

	log.Infof("Stopping Node %s", n.NodeUid)
	n.SetStatus(common.NodeStatusStopped)

	if n.McpHost != nil {
		n.McpHost.Close()
	}

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait() // Esperar a que todas las goroutines terminen

	n.Pipeline.ResetNode(n.NodeUid)

	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *AiAgentNode) GetChatMessages(userName string) []*schema.Message {
	kvStore, _ := n.GetKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		return nil
	}
	chatMessages := utils.GetChatMessages(n.Fm.Log(), kvStore, userName, n.GetOrgHash(), n.GetDigitalTwinUid())

	return chatMessages
}

func (n *AiAgentNode) SaveChatMessages(userName string, messages []*schema.Message, mcpToolCallsArray [][]mcphost.McpToolCall) error {
	kvStore, err:= n.GetKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}
	
	err = utils.SaveChatMessages(
		n.Fm.Log(),
		kvStore,
		userName,
		n.GetOrgHash(),
		n.GetDigitalTwinUid(),
		n.Fm.GetMaxChatMessagesPerUser(),
		messages,
		mcpToolCallsArray,
	)

	if err != nil {
		n.Fm.Log().Errorf("Failed to save chat messages for user %s: %v", userName, err)
		return err
	}

	return nil
}

func (n *AiAgentNode) handleMCPHostError(err error) {
	n.SetStatus(common.NodeStatusError)

	if n.LogSubject == "" {
		n.Fm.Log().Errorf("Node %s encountered an error but no log subject is set", n.NodeUid)
		return
	}

	n.Fm.Log().Errorf("MCP Host error: %v", err)

	logData := common.PipelineLog{
		Level:       "error",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: "MCP Host error",
		Message:     "An unexpected error has occurred in the AI Agent.\n The node is going to be restarted automatically.",
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal log error data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *AiAgentNode) GetName() string {
	return n.Name
}
