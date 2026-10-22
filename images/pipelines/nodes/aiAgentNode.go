package nodes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cloudwego/eino/schema"
	"github.com/osi4iot/mcphost/pkg/mcphost"
)

type AiAgentNode struct {
	BaseNode
	LlmModel       string
	LlmTemperature float64
	InputChan      chan mcphost.ChatMessage
	OutputChan     chan mcphost.LlmResponse
	hostConfig     *mcphost.HostConfig
	McpHost        mcphost.MCPHost

	// The prompt being answered, to tell in the log where an agent is
	// stuck: mcphost logs nothing unless Debug is on.
	pendingMu   sync.Mutex
	pendingUser string
	pendingAt   time.Time // zero when no prompt is waiting for an answer
}

// How long before the log says that an agent is still busy: accepting a
// prompt (the MCP host is still loading its MCP servers, or answering
// the previous one) or answering it (the LLM or a tool has not replied).
const (
	aiAgentAcceptWarnAfter = 30 * time.Second
	aiAgentAnswerWarnEvery = 60 * time.Second
)

// aiAgentDebug turns on mcphost's debug output (each tool call, its
// arguments and result, and the LLM's replies, on stdout) outside local
// mode too: PIPELINES_AI_AGENT_DEBUG=true.
func aiAgentDebug() bool {
	v, _ := strconv.ParseBool(os.Getenv("PIPELINES_AI_AGENT_DEBUG"))
	return v
}

func CreateAiAgentNode(ctx context.Context, node common.NodeData, fm common.Manager, p common.Pipeline) (*AiAgentNode, error) {
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

	if providerUrl == "" {
		fm.Log().Errorf("AI Agent Node %s: LLM provider URL must be configured", node.NodeUid)
		return nil, fmt.Errorf("LLM provider URL must be configured")
	}

	if providerApiKey == "" {
		fm.Log().Errorf("AI Agent Node %s: API key must be configured", node.NodeUid)
		return nil, fmt.Errorf("API key must be configured")
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

	mcpServersPath := fm.GetMcpServersPath()
	// The documents of the group's knowledge base are read straight from
	// the bucket by the doc_info MCP server (list, read; no writing).
	docInfoPrefix := fm.KnowledgeS3Prefix(p.GetOrgId(), p.GetGroupId())
	docInfoArgs := []string{"--prefix", docInfoPrefix}
	// The group's knowledge base (search-knowledge): searched through
	// pipelines' loopback endpoint, with a token valid for this group only.
	if url, token, ok := fm.KnowledgeSearch(p.GetGroupId()); ok {
		docInfoArgs = append(docInfoArgs,
			"--group_id", strconv.Itoa(p.GetGroupId()),
			"--knowledge_url", url,
			"--knowledge_token", token)
	}
	mcpServers := map[string]mcphost.MCPServerConfig{}

	// The FEM results are queried straight from the bucket (Parquet,
	// written when the results were uploaded); the MCP server takes the
	// bucket's settings from the environment it inherits.
	femResultsURI, hasFemResults := fm.FemResultsS3URI(ctx, p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
	if fm.GetMode() == "local" {
		mcpServers["documents"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "documents",
			Command: []string{filepath.Join(mcpServersPath, "doc_info", "doc_info")},
			Args:    docInfoArgs,
		}
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
		if hasFemResults {
			mcpServers["fem_results"] = mcphost.MCPServerConfig{
				Type:    "local",
				Name:    "fem_results",
				Command: []string{filepath.Join(mcpServersPath, "fem_results", "fem_results")},
				Args:    []string{"--results_path", femResultsURI},
			}
		}
	} else {
		mcpServers["documents"] = mcphost.MCPServerConfig{
			Type:    "local",
			Name:    "documents",
			Command: []string{"/usr/local/bin/doc_info"},
			Args:    docInfoArgs,
		}
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
		if hasFemResults {
			mcpServers["fem_results"] = mcphost.MCPServerConfig{
				Type:    "local",
				Name:    "fem_results",
				Command: []string{"/usr/local/bin/fem_results"},
				Args:    []string{"--results_path", femResultsURI},
			}
		}
	}

	debug := fm.GetMode() == "local" || aiAgentDebug()

	switch providerUrl {
	case "https://api.openai.com/v1":
		if strings.Contains(llmModel, "gpt-5") {
			providerUrl = ""
		}
	case "https://api.groq.com/openai/v1":
		llmModel = strings.ReplaceAll(llmModel, "openai:", "openai:openai/")
	}

	// Guardamos la config sin InputChan/OutputChan, se asignan en Start
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
		SavedMessages:  nil,
	}

	return &AiAgentNode{
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
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		hostConfig: hostConfig, // config guardada, sin canales ni ctx
	}, nil
}

func (n *AiAgentNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("AiAgentNode %s is already running", n.NodeUid)
		return
	}

	// Canales frescos en cada Start, importante para reinicios
	n.InputChan = make(chan mcphost.ChatMessage)
	n.OutputChan = make(chan mcphost.LlmResponse)
	n.hostConfig.InputChan = n.InputChan
	n.hostConfig.OutputChan = n.OutputChan

	// Ctx fresco derivado del ctx de la pipeline
	nodeCtx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodeCtx
	n.Cancel = nodeCancel

	// McpHost se crea aquí con el ctx y canales correctos
	newMcpHost, err := mcphost.NewMCPHost(n.hostConfig, nodeCtx, n.GetChatMessages, n.SaveChatMessages)
	if err != nil {
		log.Errorf("AiAgentNode %s: failed to create MCP host: %v", n.NodeUid, err)
		n.Cancel()
		n.SetStatus(common.NodeStatusError)
		return
	}
	n.McpHost = newMcpHost

	n.SetStatus(common.NodeStatusRunning)
	serverNames := make([]string, 0, len(n.hostConfig.MCPServers))
	for name := range n.hostConfig.MCPServers {
		serverNames = append(serverNames, name)
	}
	sort.Strings(serverNames)
	log.Infof("Starting AiAgentNode with UID: %s (model %s, MCP servers: %s)",
		n.NodeUid, n.hostConfig.Model, strings.Join(serverNames, ", "))

	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer log.Infof("MCP Host goroutine terminated for UID: %s", n.NodeUid)

		if err := n.McpHost.Run(); err != nil {
			if !errors.Is(err, context.Canceled) {
				n.handleMCPHostError(err)
				n.McpHost.Close()
			} else {
				log.Infof("MCP Host stopped gracefully due to context cancellation")
			}
		}
	}()

	n.handleInputWires(log, n.sendPromptToMcpHost)
	n.handleMcpHostMessage(ctx, log)
	n.watchPendingPrompt(log)
}

// sendPromptToMcpHost hands a prompt to the MCP host. The host takes it
// only when it is ready: after loading its MCP servers, and after
// answering the previous prompt. Until then this waits, saying so in the
// log, and gives up if the node stops.
func (n *AiAgentNode) sendPromptToMcpHost(msg mcphost.ChatMessage, log *logger.Logger) error {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("AiAgentNode %s stopped during delay, discarding message", n.NodeUid)
		return nil
	}

	log.Infof("AiAgentNode %s: prompt from %s received (%d characters)", n.NodeUid, msg.UserName, len(msg.Prompt))
	waitingSince := time.Now()
	warn := time.NewTicker(aiAgentAcceptWarnAfter)
	defer warn.Stop()
	for {
		select {
		case n.InputChan <- msg:
			n.pendingMu.Lock()
			n.pendingUser, n.pendingAt = msg.UserName, time.Now()
			n.pendingMu.Unlock()
			if waited := time.Since(waitingSince); waited > time.Second {
				log.Infof("AiAgentNode %s: prompt from %s accepted by the MCP host after %s", n.NodeUid, msg.UserName, waited.Round(time.Second))
			}
			return nil
		case <-n.Ctx.Done():
			log.Infof("AiAgentNode %s stopped, discarding the prompt from %s", n.NodeUid, msg.UserName)
			return nil
		case <-warn.C:
			n.pendingMu.Lock()
			busyUser, busySince := n.pendingUser, n.pendingAt
			n.pendingMu.Unlock()
			if !busySince.IsZero() {
				log.Warnf("AiAgentNode %s: prompt from %s waiting %s: the MCP host is still answering %s (for %s)",
					n.NodeUid, msg.UserName, time.Since(waitingSince).Round(time.Second), busyUser, time.Since(busySince).Round(time.Second))
			} else {
				log.Warnf("AiAgentNode %s: prompt from %s waiting %s: the MCP host is not ready yet (still loading its MCP servers?)",
					n.NodeUid, msg.UserName, time.Since(waitingSince).Round(time.Second))
			}
		}
	}
}

// watchPendingPrompt says in the log, every aiAgentAnswerWarnEvery, that
// a prompt is still unanswered: the LLM or one of the tools it called
// has not replied.
func (n *AiAgentNode) watchPendingPrompt(log *logger.Logger) {
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		ticker := time.NewTicker(aiAgentAnswerWarnEvery)
		defer ticker.Stop()
		for {
			select {
			case <-n.Ctx.Done():
				return
			case <-ticker.C:
				n.pendingMu.Lock()
				user, since := n.pendingUser, n.pendingAt
				n.pendingMu.Unlock()
				if !since.IsZero() && time.Since(since) >= aiAgentAnswerWarnEvery {
					log.Warnf("AiAgentNode %s: still answering %s after %s (waiting for the LLM or a tool; PIPELINES_AI_AGENT_DEBUG=true shows which)",
						n.NodeUid, user, time.Since(since).Round(time.Second))
				}
			}
		}
	}()
}

// answered clears the pending prompt and returns how long it took.
func (n *AiAgentNode) answered() (string, time.Duration) {
	n.pendingMu.Lock()
	defer n.pendingMu.Unlock()
	user, since := n.pendingUser, n.pendingAt
	n.pendingUser, n.pendingAt = "", time.Time{}
	if since.IsZero() {
		return user, 0
	}
	return user, time.Since(since)
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
					userName, ok = msg.GetStringFromPayload("userName")
					if !ok || userName == "" {
						userName = "unknown"
					}
					prompt, ok = msg.GetStringFromPayload("message")
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

func (n *AiAgentNode) handleMcpHostMessage(ctx context.Context, log *logger.Logger) {
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer log.Infof("MCP host message handler terminated for UID: %s", n.NodeUid)

		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping MCP host message handler for Node with UID: %s", n.NodeUid)
				return
			case msg, ok := <-n.OutputChan:
				if !ok {
					log.Infof("OutputChan closed for Node with UID: %s", n.NodeUid)
					return
				}

				user, took := n.answered()
				if msg.Status == "error" {
					log.Errorf("AiAgentNode %s: prompt from %s failed after %s", n.NodeUid, user, took.Round(time.Millisecond))
					errMsg := fmt.Errorf("MCP Host error: %s", msg.Message)
					n.handleMCPHostError(errMsg)
					n.McpHost.Close()
					n.Cancel()
					go func() {
						n.Pipeline.RestartNode(ctx, n.NodeUid)
					}()
					return
				}

				tools := make([]string, 0, len(msg.McpToolCalls))
				for _, call := range msg.McpToolCalls {
					tools = append(tools, call.ToolName)
				}
				log.Infof("AiAgentNode %s: answered %s in %s (tools: %s)", n.NodeUid, user, took.Round(time.Millisecond), strings.Join(tools, ", "))

				parsed := utils.ParseMessage(msg.Message)
				payload := utils.CreateCommonMessage(parsed, msg.McpToolCalls)
				n.sendToOutputs(message.NewMessageFromPayload(payload), log)
			}
		}
	}()
}

func (n *AiAgentNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("AiAgentNode %s is already stopped", n.NodeUid)
		return
	}

	log.Infof("Stopping AiAgentNode %s", n.NodeUid)

	if n.McpHost != nil {
		n.McpHost.Close() // cierra recursos del McpHost antes de cancelar el ctx
	}

	if n.Cancel != nil {
		n.Cancel() // señaliza a todas las goroutines que paren
	}

	n.wg.Wait() // espera que todas las goroutines confirmen que terminaron

	n.SetStatus(common.NodeStatusStopped) // ahora sí refleja la realidad

	log.Infof("AiAgentNode %s stopped successfully", n.NodeUid)
}

func (n *AiAgentNode) GetChatMessages(userName string) []*schema.Message {
	kvStore, _ := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		return nil
	}
	chatMessages := utils.GetChatMessages(n.Ctx, n.Fm.Log(), kvStore, userName, n.GetOrgHash(), n.GetDigitalTwinUid())

	return chatMessages
}

func (n *AiAgentNode) SaveChatMessages(
	userName string,
	messages []*schema.Message,
	mcpToolCallsArray [][]mcphost.McpToolCall,
) error {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}

	err = utils.SaveChatMessages(
		n.Ctx,
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