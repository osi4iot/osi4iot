// Package llmagent runs the AI agent of an AiAgent node on agent-sdk-go
// (github.com/Ingenimax/agent-sdk-go): the LLM, the tool-calling loop and
// the node's MCP servers.
//
// The node sends prompts on Input and reads the answers on Output; the
// conversation of each user is read and saved through the node's
// callbacks (the digital twin's NATS KV store).
//
// In operation:
//   - Each MCP server has ServerInitTimeout (30 s) to start, and they
//     start in parallel. A server that does not start is left out with a
//     warning; the others work.
//   - Each prompt has PromptTimeout: an LLM or a tool that never replies
//     ends in an error instead of blocking the node.
//   - Tools are named <server>__<tool> (fem_results__critical-value): the
//     system prompts refer to them by these names.
package llmagent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"

	"pipelines/logger"
)

// Prompt is a message from a user to the agent.
type Prompt struct {
	UserName string
	Text     string
}

// ToolCall is a tool the agent called while answering, as the chat shows
// it.
type ToolCall struct {
	ToolName string `json:"tool_name"`
	Args     string `json:"args"`
}

// Answer is the agent's reply to a prompt.
type Answer struct {
	UserName  string
	OK        bool // false: Message is the error
	Message   string
	ToolCalls []ToolCall
	Usage     *interfaces.TokenUsage // nil when the provider does not report it
}

// HistoryMessage is a message of a stored conversation.
type HistoryMessage struct {
	Role    string // "user" or "assistant"
	Content string
}

// ServerConfig is a local (stdio) MCP server.
type ServerConfig struct {
	Command string
	Args    []string
	Env     []string // KEY=VALUE added to the inherited environment
}

// Config of a Host.
type Config struct {
	// Model is "provider:model": openai:gpt-4o,
	// anthropic:claude-…, google:gemini-…, ollama:llama3.1, azure:<deployment>,
	// deepseek:deepseek-chat.
	Model          string
	ProviderURL    string // empty: the provider's default
	ProviderAPIKey string
	SystemPrompt   string
	Temperature    float64
	TopP           float64

	MCPServers map[string]ServerConfig

	MaxIterations     int           // tool-calling rounds per prompt (default 50)
	PromptTimeout     time.Duration // per prompt (default 10 min)
	ServerInitTimeout time.Duration // per MCP server (default 30 s)

	// Debug logs the SDK's messages (tool calls, arguments, results).
	// They include the MCP servers' arguments, tokens among them.
	Debug bool
	Log   *logger.Logger

	Input  <-chan Prompt
	Output chan<- Answer

	// GetHistory returns a user's conversation, oldest first.
	GetHistory func(userName string) []HistoryMessage
	// SaveTurn stores a prompt and its answer, with the tool calls of
	// the answer.
	SaveTurn func(userName string, prompt, answer string, toolCalls []ToolCall) error
}

const (
	defaultMaxIterations     = 50
	defaultPromptTimeout     = 10 * time.Minute
	defaultServerInitTimeout = 30 * time.Second
)

// Host is a running agent.
type Host struct {
	cfg    Config
	ctx    context.Context
	cancel context.CancelFunc
	log    *sdkLogger

	llm     interfaces.LLM
	tools   []interfaces.Tool
	servers *serverSet

	closeOnce sync.Once
}

// New checks the configuration and creates the LLM client. The MCP
// servers start in Run.
func New(ctx context.Context, cfg Config) (*Host, error) {
	if cfg.Log == nil {
		return nil, errors.New("llmagent: Log is required")
	}
	if cfg.Input == nil || cfg.Output == nil {
		return nil, errors.New("llmagent: Input and Output are required")
	}
	if cfg.GetHistory == nil || cfg.SaveTurn == nil {
		return nil, errors.New("llmagent: GetHistory and SaveTurn are required")
	}
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = defaultMaxIterations
	}
	if cfg.PromptTimeout <= 0 {
		cfg.PromptTimeout = defaultPromptTimeout
	}
	if cfg.ServerInitTimeout <= 0 {
		cfg.ServerInitTimeout = defaultServerInitTimeout
	}

	hostCtx, cancel := context.WithCancel(ctx)
	h := &Host{cfg: cfg, ctx: hostCtx, cancel: cancel, log: newSDKLogger(cfg.Log, cfg.Debug)}

	llm, err := newLLM(hostCtx, cfg.Model, cfg.ProviderURL, cfg.ProviderAPIKey, h.log)
	if err != nil {
		cancel()
		return nil, err
	}
	h.llm = llm
	return h, nil
}

// Run starts the MCP servers and answers prompts until the context ends
// or Input is closed. Prompts are answered one at a time, in order.
func (h *Host) Run() error {
	defer h.Close()

	h.servers, h.tools = startServers(h.ctx, h.cfg.MCPServers, h.cfg.ServerInitTimeout, h.log, h.cfg.Log)
	names := make([]string, 0, len(h.tools))
	for _, t := range h.tools {
		names = append(names, t.Name())
	}
	h.cfg.Log.Infof("AI agent ready: model %s, %d tools (%s)", h.cfg.Model, len(h.tools), strings.Join(names, ", "))

	for {
		select {
		case <-h.ctx.Done():
			return h.ctx.Err()
		case p, ok := <-h.cfg.Input:
			if !ok {
				return errors.New("input channel closed")
			}
			answer := h.answer(p)
			select {
			case h.cfg.Output <- answer:
			case <-h.ctx.Done():
				return h.ctx.Err()
			}
		}
	}
}

// Close stops the MCP servers. Safe to call more than once.
func (h *Host) Close() {
	h.closeOnce.Do(func() {
		h.cancel()
		if h.servers != nil {
			h.servers.closeAll()
		}
	})
}

func (h *Host) answer(p Prompt) Answer {
	ctx, cancel := context.WithTimeout(h.ctx, h.cfg.PromptTimeout)
	defer cancel()
	recorder := &toolCallRecorder{}
	ctx = withRecorder(ctx, recorder)

	mem := newTurnMemory(h.cfg.GetHistory(p.UserName))
	// The providers build the request from memory, which therefore has
	// to hold the prompt already (they only add it themselves when there
	// is no memory).
	_ = mem.AddMessage(ctx, interfaces.Message{Role: interfaces.MessageRoleUser, Content: p.Text})

	opts := []interfaces.GenerateOption{
		func(o *interfaces.GenerateOptions) {
			o.SystemMessage = h.cfg.SystemPrompt
			o.LLMConfig = &interfaces.LLMConfig{Temperature: h.cfg.Temperature, TopP: h.cfg.TopP}
		},
		interfaces.WithMaxIterations(h.cfg.MaxIterations),
		interfaces.WithMemory(mem),
	}

	var resp *interfaces.LLMResponse
	var err error
	if len(h.tools) > 0 {
		resp, err = h.llm.GenerateWithToolsDetailed(ctx, p.Text, h.tools, opts...)
	} else {
		resp, err = h.llm.GenerateDetailed(ctx, p.Text, opts...)
	}
	calls := recorder.calls()
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			err = fmt.Errorf("no answer after %s (the LLM or a tool did not reply): %w", h.cfg.PromptTimeout, err)
		}
		return Answer{UserName: p.UserName, OK: false, Message: err.Error(), ToolCalls: calls}
	}

	content := cleanJSONFence(resp.Content)
	if err := h.cfg.SaveTurn(p.UserName, p.Text, content, calls); err != nil {
		h.cfg.Log.Errorf("AI agent: could not save the conversation of %s: %v", p.UserName, err)
	}
	return Answer{UserName: p.UserName, OK: true, Message: content, ToolCalls: calls, Usage: resp.Usage}
}

// cleanJSONFence removes a ```json … ``` fence around the whole answer:
// the visualization answers are JSON the frontend parses.
func cleanJSONFence(s string) string {
	t := strings.TrimSpace(s)
	if strings.HasPrefix(t, "```json") && strings.HasSuffix(t, "```") {
		t = strings.TrimSuffix(strings.TrimPrefix(t, "```json"), "```")
		return strings.TrimSpace(t)
	}
	return s
}
