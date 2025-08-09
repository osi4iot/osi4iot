package nodes

import (
	"context"
	"fmt"
	"path/filepath"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"

	"github.com/osi4iot/mcphost/pkg/mcphost"
)

type LlmNode struct {
	BaseNode
	InputChan  chan string
	OutputChan chan string
	McpHost    mcphost.MCPHost
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

	inputChan := make(chan string)
	outputChan := make(chan string)
	mcpServersPath := fm.GetMcpServersPath()

	mcpServers := map[string]mcphost.MCPServerConfig{
		"filesystem": {
			Type: "builtin",
			Name: "fs",
			Options: map[string]any{
				"allowed_directories": []string{"/home/daniel/Escritorio"},
			},
		},
		"task-manager": {
			Type: "builtin",
			Name: "todo",
		},
		"web-fetcher": {
			Type: "builtin",
			Name: "http",
		},
		"current_date": {
			Type: "local",
			Command: []string{filepath.Join(mcpServersPath, "current_date", "current_date")},
			Args:  []string{},
		},
		"calculate_expression1": {
			Type: "local",
			Command:  []string{"uv"},
			Args: []string{
				"run",
				"--directory",
				"/home/daniel/Tests/mcp/python_mcp/mcp_calculate_server",
				"server.py",
			},
		},
	}

	var temperature float32 = 0.7
	var topP float32 = 0.95
	var topK int32 = 40
	hostConfig := &mcphost.HostConfig{
		NatsClient:     fm.GetNatsClient(),
		MCPServers:     mcpServers,
		Model:          fm.GetLlmModel(),
		MaxSteps:       100,
		Debug:          true,
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

	newMcpHost, err := mcphost.NewMCPHost(hostConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP host: %w", err)
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
		McpHost:    newMcpHost,
	}

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
			// Manejar el error, por ejemplo loggearlo
			log.Errorf("MCP Host error: %v", err)
			n.HandleError(err)
			return
		}
	}()

	n.handleInputWires(log, n.sendPromptToMcpHost)
	n.handleMcpHostMessage(log)
}

func (n *LlmNode) sendPromptToMcpHost(msg string, log *logger.Logger) error {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("LlmNode %s stopped during delay, discarding message", n.NodeUid)
		return nil
	}

	n.InputChan <- msg

	return nil
}

func (n *LlmNode) handleInputWires(log *logger.Logger, processor func(string, *logger.Logger) error) {
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

					prompt := msg.Payload["message"].(string)
					if err := processor(prompt, log); err != nil {
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
				log.Infof("Received message from MCP host for Node %s: %s", n.NodeUid, msg)

				message := common.Message{
					Payload: map[string]interface{}{
						"message": msg,
					},
				}

				n.sendToOutputs(message, log)
			}
		}
	}()

	return nil
}
