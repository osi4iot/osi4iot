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
	parentCtx   context.Context // the pipeline's: node restarts go through it

	// The running agent. It is replaced, with its MCP servers, when the
	// digital twin's FEM results appear, change or go (see
	// reloadIfFemResultsChanged).
	hostMu            sync.Mutex
	agentHost         *llmagent.Host
	hostDone          chan struct{} // closed when agentHost's Run returns
	femResultsServer  aiAgentServer // without --results_path
	femResultsVersion string        // of the results agentHost has; "" none

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
	// bucket's settings from the environment it inherits. It is added
	// when the agent starts, if the results are there (startHost).
	var femResultsServer aiAgentServer
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
		femResultsServer = aiAgentServer{
			command: []string{filepath.Join(mcpServersPath, "fem_results", "fem_results")},
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
		femResultsServer = aiAgentServer{
			command: []string{"/usr/local/bin/fem_results"},
		}
	}

	agentServers := map[string]llmagent.ServerConfig{}
	for name, srv := range servers {
		agentServers[name] = srv.config()
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
		agentConfig:      agentConfig, // the configuration; channels and callbacks are set in Start
		femResultsServer: femResultsServer,
	}, nil
}

func (s aiAgentServer) config() llmagent.ServerConfig {
	return llmagent.ServerConfig{
		Command: s.command[0],
		Args:    append(append([]string{}, s.command[1:]...), s.args...),
	}
}

// femResultsCheckTimeout bounds the look at the bucket for the FEM
// results (one HEAD request).
const femResultsCheckTimeout = 10 * time.Second

// femResults returns where the digital twin's FEM results are and their
// version ("" none). ok is false when the bucket could not be asked.
func (n *AiAgentNode) femResults(ctx context.Context, log *logger.Logger) (uri, version string, ok bool) {
	ctx, cancel := context.WithTimeout(ctx, femResultsCheckTimeout)
	defer cancel()
	p := n.Pipeline
	uri, version, err := n.Fm.FemResultsS3URI(ctx, p.GetOrgId(), p.GetGroupId(), p.GetDigitalTwinId())
	if err != nil {
		log.Warnf("AiAgentNode %s: could not check the FEM results: %v", n.NodeUid, err)
		return "", "", false
	}
	return uri, version, true
}

// startHost creates and runs the agent, with the fem_results MCP server
// when the FEM results are there. Called with hostMu held, or before the
// node runs.
func (n *AiAgentNode) startHost(log *logger.Logger, femURI, femVersion string) ([]string, error) {
	cfg := n.agentConfig
	cfg.Input = n.agentIn
	cfg.Output = n.agentOut
	cfg.GetHistory = n.agentHistory
	cfg.SaveTurn = n.saveAgentTurn
	cfg.MCPServers = make(map[string]llmagent.ServerConfig, len(n.agentConfig.MCPServers)+1)
	for name, srv := range n.agentConfig.MCPServers {
		cfg.MCPServers[name] = srv
	}
	if femVersion != "" && len(n.femResultsServer.command) > 0 {
		srv := n.femResultsServer
		srv.args = []string{"--results_path", femURI}
		cfg.MCPServers["fem_results"] = srv.config()
	}

	host, err := llmagent.New(n.Ctx, cfg)
	if err != nil {
		return nil, err
	}
	done := make(chan struct{})
	n.agentHost, n.hostDone, n.femResultsVersion = host, done, femVersion

	parentCtx := n.parentCtx
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		defer close(done)
		defer log.Infof("AI agent goroutine terminated for UID: %s", n.NodeUid)

		if err := host.Run(); err != nil {
			// Canceled: the node stopped, or this agent was replaced.
			if errors.Is(err, context.Canceled) {
				log.Infof("AI agent stopped gracefully due to context cancellation")
				return
			}
			n.handleAgentFailure(err)
			host.Close()
			n.Cancel()
			go func() {
				_ = n.Pipeline.RestartNode(parentCtx, n.NodeUid)
			}()
		}
	}()

	names := make([]string, 0, len(cfg.MCPServers))
	for name := range cfg.MCPServers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// reloadIfFemResultsChanged restarts the agent, and so its MCP servers,
// when the digital twin's FEM results have appeared, changed or gone
// since it started: the node may start before pipelines has converted
// them (at startup, or after an upload), and the fem_results server reads
// the results it was started with. Checked before each prompt (a HEAD
// request to the bucket) and only while no prompt is being answered; the
// conversations are kept (KV store).
func (n *AiAgentNode) reloadIfFemResultsChanged(log *logger.Logger) {
	n.hostMu.Lock()
	defer n.hostMu.Unlock()

	uri, version, ok := n.femResults(n.Ctx, log)
	if !ok || version == n.femResultsVersion {
		return
	}
	n.pendingMu.Lock()
	busy := !n.pendingAt.IsZero()
	n.pendingMu.Unlock()
	if busy {
		return // checked again with the next prompt
	}

	what := "updated"
	switch {
	case n.femResultsVersion == "":
		what = "available"
	case version == "":
		what = "removed"
	}
	if n.agentHost != nil {
		n.agentHost.Close()
		// The old agent must not take the next prompt.
		select {
		case <-n.hostDone:
		case <-time.After(30 * time.Second):
			log.Warnf("AiAgentNode %s: the previous AI agent is slow to stop", n.NodeUid)
		}
	}
	names, err := n.startHost(log, uri, version)
	if err != nil {
		log.Errorf("AiAgentNode %s: failed to restart the AI agent: %v", n.NodeUid, err)
		n.handleAgentFailure(err)
		n.Cancel()
		go func() { _ = n.Pipeline.RestartNode(n.parentCtx, n.NodeUid) }()
		return
	}
	log.Infof("AiAgentNode %s: FEM results %s, AI agent restarted (MCP servers: %s)",
		n.NodeUid, what, strings.Join(names, ", "))
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
	n.parentCtx = ctx
	n.agentIn = make(chan llmagent.Prompt)
	n.agentOut = make(chan llmagent.Answer)

	// Without an answer from the bucket the agent starts without
	// fem_results; the next prompt checks again.
	femURI, femVersion, _ := n.femResults(nodeCtx, log)
	n.hostMu.Lock()
	serverNames, err := n.startHost(log, femURI, femVersion)
	n.hostMu.Unlock()
	if err != nil {
		log.Errorf("AiAgentNode %s: failed to create the AI agent: %v", n.NodeUid, err)
		n.Cancel()
		n.SetStatus(common.NodeStatusError)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting AiAgentNode with UID: %s (model %s, MCP servers: %s)",
		n.NodeUid, n.agentConfig.Model, strings.Join(serverNames, ", "))

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
	n.reloadIfFemResultsChanged(log)
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

	n.hostMu.Lock()
	if n.agentHost != nil {
		n.agentHost.Close() // stops the MCP servers before the context ends
	}
	n.hostMu.Unlock()
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
