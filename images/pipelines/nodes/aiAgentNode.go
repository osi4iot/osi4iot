package nodes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"pipelines/common"
	"pipelines/llmagent"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// AiAgentNode runs an AI agent (package llmagent, on agent-sdk-go): an
// LLM with the platform's MCP tools, which answers the prompts that
// reach the node and keeps each user's conversation in the digital
// twin's KV store.
type AiAgentNode struct {
	BaseNode

	agentConfig llmagent.Config // channels and callbacks are set in Start
	agentIn     chan llmagent.Prompt
	agentOut    chan llmagent.Answer
	agentHost   *llmagent.Host

	// The prompt being answered, to tell in the log where an agent is
	// stuck.
	pendingMu   sync.Mutex
	pendingUser string
	pendingAt   time.Time // zero when no prompt is waiting for an answer
}

// How long before the log says that an agent is still busy: accepting a
// prompt (it is still starting its MCP servers, or answering the
// previous one) or answering it (the LLM or a tool has not replied).
const (
	aiAgentAcceptWarnAfter = 30 * time.Second
	aiAgentAnswerWarnEvery = 60 * time.Second
)

// aiAgentServer is an MCP server of the node.
type aiAgentServer struct {
	command []string
	args    []string
}

// aiAgentDebug logs the agents' tool calls, arguments and results, and
// the LLM's requests, outside local mode too:
// PIPELINES_AI_AGENT_DEBUG=true.
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

	llmModel, _ := node.Settings["llmModel"].(string)
	if strings.TrimSpace(llmModel) == "" {
		llmModel = defaultLlmModel(fm.GetOrgLlmAllowedModels(orgId), fm.GetDefaultLlmModel())
	}
	// "<provider type>:<model id>" (see llmModel.go).
	llmModel = resolveLlmModel(llmModel, fm.GetOrgLlmProviderType(orgId), providerUrl)

	// JSON numbers arrive as float64: the float32 assertion alone never
	// matched, and the default was always used.
	llmTemperature := fm.GetDefaultLlmTemperature()
	switch t := node.Settings["llmTemperature"].(type) {
	case float64:
		llmTemperature = float32(t)
	case float32:
		llmTemperature = t
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
	servers := map[string]aiAgentServer{}

	// The FEM results are queried straight from the bucket (Parquet,
	// written when the results were uploaded); the MCP server takes the
	// bucket's settings from the environment it inherits.
	femResultsURI, hasFemResults := fm.FemResultsS3URI(ctx, p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
	if fm.GetMode() == "local" {
		servers["documents"] = aiAgentServer{
			command: []string{filepath.Join(mcpServersPath, "doc_info", "doc_info")},
			args:    docInfoArgs,
		}
		servers["current_date"] = aiAgentServer{
			command: []string{filepath.Join(mcpServersPath, "current_date", "current_date")},
		}
		servers["calculate_expression1"] = aiAgentServer{
			command: []string{"uv"},
			args: []string{
				"run",
				"--directory",
				filepath.Join(mcpServersPath, "mcp_calculate_server"),
				"server.py",
			},
		}
		if hasFemResults {
			servers["fem_results"] = aiAgentServer{
				command: []string{filepath.Join(mcpServersPath, "fem_results", "fem_results")},
				args:    []string{"--results_path", femResultsURI},
			}
		}
	} else {
		servers["documents"] = aiAgentServer{
			command: []string{"/usr/local/bin/doc_info"},
			args:    docInfoArgs,
		}
		servers["current_date"] = aiAgentServer{
			command: []string{"/usr/local/bin/current_date"},
		}
		servers["calculate_expression1"] = aiAgentServer{
			command: []string{"/opt/venv/bin/python"},
			args:    []string{"-m", "server"},
		}
		if hasFemResults {
			servers["fem_results"] = aiAgentServer{
				command: []string{"/usr/local/bin/fem_results"},
				args:    []string{"--results_path", femResultsURI},
			}
		}
	}

	agentServers := map[string]llmagent.ServerConfig{}
	for name, srv := range servers {
		agentServers[name] = llmagent.ServerConfig{
			Command: srv.command[0],
			Args:    append(append([]string{}, srv.command[1:]...), srv.args...),
		}
	}

	// No max tokens: the providers use the model's own limit.
	agentConfig := llmagent.Config{
		Model:          llmModel,
		ProviderURL:    providerUrl,
		ProviderAPIKey: providerApiKey,
		SystemPrompt:   systemPrompt,
		Temperature:    float64(llmTemperature),
		TopP:           float64(llmTopP),
		MCPServers:     agentServers,
		Debug:          fm.GetMode() == "local" || aiAgentDebug(),
		Log:            fm.Log(),
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
		agentConfig: agentConfig, // the configuration; channels and callbacks are set in Start
	}, nil
}

func (n *AiAgentNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("AiAgentNode %s is already running", n.NodeUid)
		return
	}

	// A fresh context and channels on every start (restarts too).
	nodeCtx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodeCtx
	n.Cancel = nodeCancel
	n.agentIn = make(chan llmagent.Prompt)
	n.agentOut = make(chan llmagent.Answer)

	cfg := n.agentConfig
	cfg.Input = n.agentIn
	cfg.Output = n.agentOut
	cfg.GetHistory = n.agentHistory
	cfg.SaveTurn = n.saveAgentTurn
	host, err := llmagent.New(nodeCtx, cfg)
	if err != nil {
		log.Errorf("AiAgentNode %s: failed to create the AI agent: %v", n.NodeUid, err)
		n.Cancel()
		n.SetStatus(common.NodeStatusError)
		return
	}
	n.agentHost = host

	n.SetStatus(common.NodeStatusRunning)
	serverNames := make([]string, 0, len(cfg.MCPServers))
	for name := range cfg.MCPServers {
		serverNames = append(serverNames, name)
	}
	sort.Strings(serverNames)
	log.Infof("Starting AiAgentNode with UID: %s (model %s, MCP servers: %s)",
		n.NodeUid, cfg.Model, strings.Join(serverNames, ", "))

	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer log.Infof("AI agent goroutine terminated for UID: %s", n.NodeUid)

		if err := host.Run(); err != nil {
			if errors.Is(err, context.Canceled) {
				log.Infof("AI agent stopped gracefully due to context cancellation")
				return
			}
			n.handleAgentFailure(err)
			host.Close()
			n.Cancel()
			go func() {
				_ = n.Pipeline.RestartNode(ctx, n.NodeUid)
			}()
		}
	}()

	n.handleInputWires(log, n.sendPrompt)
	n.handleAgentAnswers(log)
	n.watchPendingPrompt(log)
}

// sendPrompt hands a prompt to the agent. The agent takes it when it is
// ready: after starting its MCP servers, and after answering the
// previous prompt. Until then this waits, saying so in the log, and
// gives up if the node stops.
func (n *AiAgentNode) sendPrompt(prompt llmagent.Prompt, log *logger.Logger) error {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("AiAgentNode %s stopped during delay, discarding message", n.NodeUid)
		return nil
	}

	log.Infof("AiAgentNode %s: prompt from %s received (%d characters)", n.NodeUid, prompt.UserName, len(prompt.Text))
	waitingSince := time.Now()
	warn := time.NewTicker(aiAgentAcceptWarnAfter)
	defer warn.Stop()
	for {
		select {
		case n.agentIn <- prompt:
			n.pendingMu.Lock()
			n.pendingUser, n.pendingAt = prompt.UserName, time.Now()
			n.pendingMu.Unlock()
			if waited := time.Since(waitingSince); waited > time.Second {
				log.Infof("AiAgentNode %s: prompt from %s accepted by the agent after %s", n.NodeUid, prompt.UserName, waited.Round(time.Second))
			}
			return nil
		case <-n.Ctx.Done():
			log.Infof("AiAgentNode %s stopped, discarding the prompt from %s", n.NodeUid, prompt.UserName)
			return nil
		case <-warn.C:
			n.pendingMu.Lock()
			busyUser, busySince := n.pendingUser, n.pendingAt
			n.pendingMu.Unlock()
			if !busySince.IsZero() {
				log.Warnf("AiAgentNode %s: prompt from %s waiting %s: the agent is still answering %s (for %s)",
					n.NodeUid, prompt.UserName, time.Since(waitingSince).Round(time.Second), busyUser, time.Since(busySince).Round(time.Second))
			} else {
				log.Warnf("AiAgentNode %s: prompt from %s waiting %s: the agent is not ready yet (still starting its MCP servers?)",
					n.NodeUid, prompt.UserName, time.Since(waitingSince).Round(time.Second))
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

func (n *AiAgentNode) handleInputWires(log *logger.Logger, processor func(llmagent.Prompt, *logger.Logger) error) {
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

					var userName, text string
					userName, ok = msg.GetStringFromPayload("userName")
					if !ok || userName == "" {
						userName = "unknown"
					}
					text, ok = msg.GetStringFromPayload("message")
					if !ok || text == "" {
						text = "no prompt"
					}
					if err := processor(llmagent.Prompt{UserName: userName, Text: text}, log); err != nil {
						n.HandleError(err)
					}
				}
			}
		}(i, wire)
	}
}

func (n *AiAgentNode) handleAgentAnswers(log *logger.Logger) {
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer log.Infof("AI agent answer handler terminated for UID: %s", n.NodeUid)

		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping AI agent answer handler for Node with UID: %s", n.NodeUid)
				return
			case answer, ok := <-n.agentOut:
				if !ok {
					log.Infof("Agent output closed for Node with UID: %s", n.NodeUid)
					return
				}
				n.handleAgentAnswer(answer, log)
			}
		}
	}()
}

// handleAgentAnswer sends an answer to the node's outputs. An error (a
// failed or timed-out prompt) does not restart the node: the agent is
// still working, so the user gets the error as the answer and the
// pipeline log records it.
func (n *AiAgentNode) handleAgentAnswer(answer llmagent.Answer, log *logger.Logger) {
	user, took := n.answered()
	calls := toolCalls(answer.ToolCalls)
	tools := make([]string, 0, len(calls))
	for _, c := range calls {
		tools = append(tools, c.ToolName)
	}

	text := answer.Message
	if !answer.OK {
		log.Errorf("AiAgentNode %s: prompt from %s failed after %s: %s", n.NodeUid, user, took.Round(time.Millisecond), answer.Message)
		n.publishAgentLog("error", "AI agent error", "The AI agent could not answer: "+answer.Message)
		text = "Error: " + answer.Message
	} else {
		usage := ""
		if answer.Usage != nil {
			usage = fmt.Sprintf(", tokens in/out %d/%d", answer.Usage.InputTokens, answer.Usage.OutputTokens)
		}
		log.Infof("AiAgentNode %s: answered %s in %s (tools: %s%s)", n.NodeUid, user, took.Round(time.Millisecond), strings.Join(tools, ", "), usage)
	}

	parsed := utils.ParseMessage(text)
	payload := utils.CreateCommonMessage(parsed, calls)
	n.sendToOutputs(message.NewMessageFromPayload(payload), log)
}

func toolCalls(calls []llmagent.ToolCall) []utils.ToolCall {
	out := make([]utils.ToolCall, 0, len(calls))
	for _, c := range calls {
		out = append(out, utils.ToolCall{ToolName: c.ToolName, Args: c.Args})
	}
	return out
}

// agentHistory gives the agent a user's stored conversation.
func (n *AiAgentNode) agentHistory(userName string) []llmagent.HistoryMessage {
	kvStore, _ := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		return nil
	}
	stored := utils.GetChatMessages(n.Ctx, n.Fm.Log(), kvStore, userName, n.GetOrgHash(), n.GetDigitalTwinUid())
	history := make([]llmagent.HistoryMessage, 0, len(stored))
	for _, m := range stored {
		history = append(history, llmagent.HistoryMessage{Role: m.Role, Content: m.Content})
	}
	return history
}

// saveAgentTurn stores a prompt and its answer: the user message, the
// assistant message, and the tool calls of the answer.
func (n *AiAgentNode) saveAgentTurn(userName, prompt, answer string, calls []llmagent.ToolCall) error {
	kvStore, err := n.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if err != nil {
		return err
	}
	messages := []utils.StoredMessage{
		{Role: "user", Content: prompt},
		{Role: "assistant", Content: answer},
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
		[][]utils.ToolCall{nil, toolCalls(calls)},
	)
	if err != nil {
		n.Fm.Log().Errorf("Failed to save chat messages for user %s: %v", userName, err)
	}
	return err
}

func (n *AiAgentNode) publishAgentLog(level, description, text string) {
	if n.LogSubject == "" {
		return
	}
	logData := common.PipelineLog{
		Level:       level,
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: description,
		Message:     text,
	}
	if logJSON, err := json.Marshal(logData); err == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal log data for node %s: %v", n.NodeUid, err)
	}
}

// handleAgentFailure records that the agent itself stopped (not a
// prompt): the node is restarted.
func (n *AiAgentNode) handleAgentFailure(err error) {
	n.SetStatus(common.NodeStatusError)
	n.Fm.Log().Errorf("AiAgentNode %s: the AI agent stopped: %v", n.NodeUid, err)
	n.publishAgentLog("error", "AI agent failure",
		"An unexpected error has occurred in the AI Agent.\n The node is going to be restarted automatically.")
}

func (n *AiAgentNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		log.Infof("AiAgentNode %s is already stopped", n.NodeUid)
		return
	}

	log.Infof("Stopping AiAgentNode %s", n.NodeUid)

	if n.agentHost != nil {
		n.agentHost.Close() // stops the MCP servers before the context ends
	}
	if n.Cancel != nil {
		n.Cancel()
	}
	n.wg.Wait()
	n.SetStatus(common.NodeStatusStopped)

	log.Infof("AiAgentNode %s stopped successfully", n.NodeUid)
}

func (n *AiAgentNode) GetName() string {
	return n.Name
}

