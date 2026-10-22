package llmagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"
	sdkmcp "github.com/Ingenimax/agent-sdk-go/pkg/mcp"

	"pipelines/logger"
)

// toolNameSeparator joins server and tool names
// (fem_results__critical-value): the system prompts use these names.
const toolNameSeparator = "__"

type serverSet struct {
	mu      sync.Mutex
	servers map[string]interfaces.MCPServer
	closed  bool
}

func (s *serverSet) add(name string, srv interfaces.MCPServer) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	s.servers[name] = srv
	return true
}

func (s *serverSet) closeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	for _, srv := range s.servers {
		_ = srv.Close()
	}
	s.servers = map[string]interfaces.MCPServer{}
}

// startServers starts the MCP servers in parallel, each with initTimeout
// to start and list its tools. A server that fails or is late is left
// out, with a warning; if it starts later anyway it is closed.
func startServers(
	ctx context.Context,
	configs map[string]ServerConfig,
	initTimeout time.Duration,
	sdkLog *sdkLogger,
	log *logger.Logger,
) (*serverSet, []interfaces.Tool) {
	set := &serverSet{servers: map[string]interfaces.MCPServer{}}

	type result struct {
		name  string
		tools []interfaces.Tool
	}
	results := make(chan result, len(configs))
	var wg sync.WaitGroup

	for name, cfg := range configs {
		wg.Add(1)
		go func(name string, cfg ServerConfig) {
			defer wg.Done()
			started := time.Now()
			srv, tools, err := startServer(ctx, name, cfg, initTimeout, sdkLog)
			if err != nil {
				log.Warnf("AI agent: MCP server %s not loaded: %v", name, err)
				return
			}
			if !set.add(name, srv) {
				_ = srv.Close() // the host stopped meanwhile
				return
			}
			log.Infof("AI agent: MCP server %s loaded in %s (%d tools)", name, time.Since(started).Round(time.Millisecond), len(tools))
			results <- result{name: name, tools: tools}
		}(name, cfg)
	}
	wg.Wait()
	close(results)

	var all []interfaces.Tool
	for r := range results {
		all = append(all, r.tools...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Name() < all[j].Name() })
	return set, all
}

func startServer(
	ctx context.Context,
	name string,
	cfg ServerConfig,
	initTimeout time.Duration,
	sdkLog *sdkLogger,
) (interfaces.MCPServer, []interfaces.Tool, error) {
	type started struct {
		srv interfaces.MCPServer
		err error
	}
	done := make(chan started, 1)
	go func() {
		// The process lives as long as ctx (exec.CommandContext): pass
		// the host's context, not one with the init timeout.
		srv, err := sdkmcp.NewStdioServer(ctx, sdkmcp.StdioServerConfig{
			Command: cfg.Command,
			Args:    cfg.Args,
			Env:     cfg.Env,
			Logger:  sdkLog,
		})
		done <- started{srv, err}
	}()

	timer := time.NewTimer(initTimeout)
	defer timer.Stop()
	var srv interfaces.MCPServer
	select {
	case s := <-done:
		if s.err != nil {
			return nil, nil, s.err
		}
		srv = s.srv
	case <-timer.C:
		// Close it if it ever finishes starting.
		go func() {
			if s := <-done; s.err == nil && s.srv != nil {
				_ = s.srv.Close()
			}
		}()
		return nil, nil, fmt.Errorf("it did not start in %s", initTimeout)
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	}

	listCtx, cancel := context.WithTimeout(ctx, initTimeout)
	defer cancel()
	mcpTools, err := srv.ListTools(listCtx)
	if err != nil {
		_ = srv.Close()
		return nil, nil, fmt.Errorf("listing its tools: %w", err)
	}
	tools := make([]interfaces.Tool, 0, len(mcpTools))
	for _, t := range mcpTools {
		tools = append(tools, &serverTool{
			name:   name + toolNameSeparator + t.Name,
			inner:  sdkmcp.NewMCPTool(t.Name, t.Description, t.Schema, srv),
			tool:   t.Name,
			server: srv,
		})
	}
	return srv, tools, nil
}

// serverTool is an MCP tool named <server>__<tool>. It records each call
// for the chat (Answer.ToolCalls) and returns the text of the result
// rather than its JSON envelope.
type serverTool struct {
	name   string
	inner  interfaces.Tool // the SDK's adapter, for the parameter schema
	tool   string          // name on the server
	server interfaces.MCPServer
}

func (t *serverTool) Name() string        { return t.name }
func (t *serverTool) DisplayName() string { return t.name }
func (t *serverTool) Internal() bool      { return false }
func (t *serverTool) Description() string { return t.inner.Description() }

func (t *serverTool) Parameters() map[string]interfaces.ParameterSpec {
	return t.inner.Parameters()
}

func (t *serverTool) Run(ctx context.Context, input string) (string, error) {
	return t.Execute(ctx, input)
}

func (t *serverTool) Execute(ctx context.Context, args string) (string, error) {
	recorderFrom(ctx).add(ToolCall{ToolName: t.name, Args: args})

	var parsed map[string]interface{}
	if strings.TrimSpace(args) != "" {
		if err := json.Unmarshal([]byte(args), &parsed); err != nil {
			return "", fmt.Errorf("invalid arguments for %s: %w", t.name, err)
		}
	}
	if parsed == nil {
		parsed = map[string]interface{}{}
	}

	resp, err := t.server.CallTool(ctx, t.tool, parsed)
	if err != nil {
		return "", err
	}
	text := contentText(resp.Content)
	if resp.IsError {
		if text == "" {
			text = "the tool reported an error"
		}
		return "", errors.New(text)
	}
	return text, nil
}

// contentText joins the text parts of an MCP result. Other parts
// (images, resources) are passed on as JSON.
func contentText(content interface{}) string {
	switch c := content.(type) {
	case nil:
		return ""
	case string:
		return c
	case []byte:
		return string(c)
	}
	raw, err := json.Marshal(content)
	if err != nil {
		return fmt.Sprintf("%v", content)
	}
	var parts []map[string]interface{}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return string(raw)
	}
	var b strings.Builder
	for _, p := range parts {
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		if text, ok := p["text"].(string); ok && (p["type"] == nil || p["type"] == "text") {
			b.WriteString(text)
			continue
		}
		pj, _ := json.Marshal(p)
		b.Write(pj)
	}
	return b.String()
}

// toolCallRecorder collects the tool calls of one prompt.
type toolCallRecorder struct {
	mu   sync.Mutex
	list []ToolCall
}

func (r *toolCallRecorder) add(c ToolCall) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.list = append(r.list, c)
	r.mu.Unlock()
}

func (r *toolCallRecorder) calls() []ToolCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]ToolCall(nil), r.list...)
}

type recorderKey struct{}

func withRecorder(ctx context.Context, r *toolCallRecorder) context.Context {
	return context.WithValue(ctx, recorderKey{}, r)
}

func recorderFrom(ctx context.Context) *toolCallRecorder {
	r, _ := ctx.Value(recorderKey{}).(*toolCallRecorder)
	return r
}
