package llmagent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"

	"pipelines/logger"
)

// fakeLLM checks what a provider would see (system prompt, history and
// prompt from memory), calls the first tool, and answers with a fenced
// JSON, as the visualization answers come.
type fakeLLM struct {
	t        *testing.T
	sawUser  []string
	toolArgs string
	block    bool
}

func (f *fakeLLM) Name() string            { return "fake" }
func (f *fakeLLM) SupportsStreaming() bool { return false }
func (f *fakeLLM) Generate(ctx context.Context, p string, o ...interfaces.GenerateOption) (string, error) {
	r, err := f.GenerateDetailed(ctx, p, o...)
	if err != nil {
		return "", err
	}
	return r.Content, nil
}
func (f *fakeLLM) GenerateWithTools(ctx context.Context, p string, tools []interfaces.Tool, o ...interfaces.GenerateOption) (string, error) {
	r, err := f.GenerateWithToolsDetailed(ctx, p, tools, o...)
	if err != nil {
		return "", err
	}
	return r.Content, nil
}
func (f *fakeLLM) GenerateDetailed(ctx context.Context, p string, o ...interfaces.GenerateOption) (*interfaces.LLMResponse, error) {
	return f.GenerateWithToolsDetailed(ctx, p, nil, o...)
}

func (f *fakeLLM) GenerateWithToolsDetailed(ctx context.Context, prompt string, tools []interfaces.Tool, o ...interfaces.GenerateOption) (*interfaces.LLMResponse, error) {
	var opts interfaces.GenerateOptions
	for _, opt := range o {
		opt(&opts)
	}
	if opts.SystemMessage != "You are OSI." {
		f.t.Errorf("system message = %q", opts.SystemMessage)
	}
	if opts.MaxIterations != defaultMaxIterations {
		f.t.Errorf("max iterations = %d", opts.MaxIterations)
	}
	if opts.Memory == nil {
		f.t.Fatal("no memory")
	}
	msgs, _ := opts.Memory.GetMessages(ctx)
	f.sawUser = nil
	for _, m := range msgs {
		if m.Role == interfaces.MessageRoleUser {
			f.sawUser = append(f.sawUser, m.Content)
		}
	}
	if f.block {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if len(tools) > 0 {
		if _, err := tools[0].Execute(ctx, f.toolArgs); err != nil {
			return nil, err
		}
	}
	return &interfaces.LLMResponse{
		Content: "```json\n{\"message\":\"ok\"}\n```",
		Usage:   &interfaces.TokenUsage{InputTokens: 10, OutputTokens: 2},
	}, nil
}

// fakeServer is an MCP server with one tool that echoes its arguments.
type fakeServer struct {
	interfaces.MCPServer
	gotName string
	gotArgs interface{}
}

func (s *fakeServer) CallTool(_ context.Context, name string, args interface{}) (*interfaces.MCPToolResponse, error) {
	s.gotName, s.gotArgs = name, args
	return &interfaces.MCPToolResponse{Content: []map[string]interface{}{
		{"type": "text", "text": "Sx_crit = 1.2e6"},
	}}, nil
}

func newTestHost(t *testing.T, llm interfaces.LLM, srv *fakeServer, saved *[]string) *Host {
	t.Helper()
	log := logger.NewLogger()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	h := &Host{
		cfg: Config{
			SystemPrompt:  "You are OSI.",
			MaxIterations: defaultMaxIterations,
			PromptTimeout: 2 * time.Second,
			Log:           log,
			GetHistory: func(user string) []HistoryMessage {
				return []HistoryMessage{
					{Role: "user", Content: "earlier question"},
					{Role: "assistant", Content: "earlier answer"},
					{Role: "system", Content: "dropped"},
				}
			},
			SaveTurn: func(user, prompt, answer string, calls []ToolCall) error {
				b, _ := json.Marshal(calls)
				*saved = append(*saved, user+"|"+prompt+"|"+answer+"|"+string(b))
				return nil
			},
		},
		ctx:    ctx,
		cancel: cancel,
		log:    newSDKLogger(log, false),
		llm:    llm,
	}
	if srv != nil {
		h.tools = []interfaces.Tool{&serverTool{
			name:   "fem_results" + toolNameSeparator + "critical-value",
			inner:  &stubTool{},
			tool:   "critical-value",
			server: srv,
		}}
	}
	return h
}

type stubTool struct{ interfaces.Tool }

func (stubTool) Description() string { return "critical value" }

func TestAnswerWithToolAndHistory(t *testing.T) {
	llm := &fakeLLM{t: t, toolArgs: `{"params":[1],"result_names":["Sx_top"]}`}
	srv := &fakeServer{}
	var saved []string
	h := newTestHost(t, llm, srv, &saved)

	a := h.answer(Prompt{UserName: "ana", Text: "critical stress?"})
	if !a.OK {
		t.Fatalf("answer failed: %s", a.Message)
	}
	if a.Message != `{"message":"ok"}` {
		t.Errorf("fence not removed: %q", a.Message)
	}
	if got := strings.Join(llm.sawUser, ";"); got != "earlier question;critical stress?" {
		t.Errorf("the LLM saw users %q", got)
	}
	if srv.gotName != "critical-value" {
		t.Errorf("server got tool %q (want its own name, without prefix)", srv.gotName)
	}
	if args, _ := srv.gotArgs.(map[string]interface{}); args["result_names"] == nil {
		t.Errorf("server got args %v", srv.gotArgs)
	}
	if len(a.ToolCalls) != 1 || a.ToolCalls[0].ToolName != "fem_results__critical-value" {
		t.Errorf("tool calls = %+v", a.ToolCalls)
	}
	if a.Usage == nil || a.Usage.InputTokens != 10 {
		t.Errorf("usage = %+v", a.Usage)
	}
	if len(saved) != 1 || !strings.HasPrefix(saved[0], `ana|critical stress?|{"message":"ok"}|[{"tool_name":"fem_results__critical-value"`) {
		t.Errorf("saved = %v", saved)
	}
}

func TestAnswerTimeout(t *testing.T) {
	llm := &fakeLLM{t: t, block: true}
	var saved []string
	h := newTestHost(t, llm, nil, &saved)
	h.cfg.PromptTimeout = 100 * time.Millisecond

	start := time.Now()
	a := h.answer(Prompt{UserName: "ana", Text: "hello"})
	if a.OK || !strings.Contains(a.Message, "no answer after") {
		t.Fatalf("want a timeout error, got %+v", a)
	}
	if time.Since(start) > time.Second {
		t.Errorf("the timeout took %s", time.Since(start))
	}
	if len(saved) != 0 {
		t.Errorf("a failed prompt was saved: %v", saved)
	}
}

func TestToolError(t *testing.T) {
	tool := &serverTool{name: "x__y", inner: &stubTool{}, tool: "y", server: &errorServer{}}
	_, err := tool.Execute(context.Background(), `{}`)
	if err == nil || err.Error() != "bad input" {
		t.Fatalf("err = %v", err)
	}
}

type errorServer struct{ interfaces.MCPServer }

func (errorServer) CallTool(context.Context, string, interface{}) (*interfaces.MCPToolResponse, error) {
	return &interfaces.MCPToolResponse{IsError: true, Content: []map[string]interface{}{{"type": "text", "text": "bad input"}}}, nil
}

func TestContentText(t *testing.T) {
	if got := contentText([]map[string]interface{}{{"type": "text", "text": "a"}, {"type": "text", "text": "b"}}); got != "a\nb" {
		t.Errorf("got %q", got)
	}
	if got := contentText("plain"); got != "plain" {
		t.Errorf("got %q", got)
	}
	if got := contentText([]map[string]interface{}{{"type": "image", "data": "x"}}); !strings.Contains(got, `"image"`) {
		t.Errorf("got %q", got)
	}
}

func TestCleanJSONFence(t *testing.T) {
	if got := cleanJSONFence("```json\n{\"a\":1}\n```"); got != `{"a":1}` {
		t.Errorf("got %q", got)
	}
	if got := cleanJSONFence("plain text"); got != "plain text" {
		t.Errorf("got %q", got)
	}
}

func TestStartServersTimeout(t *testing.T) {
	// No real servers here: an unknown command fails at once and is
	// left out (with a warning), without blocking.
	log := logger.NewLogger()
	start := time.Now()
	set, tools := startServers(context.Background(), map[string]ServerConfig{
		"missing": {Command: "/nonexistent/mcp-server"},
	}, 200*time.Millisecond, newSDKLogger(log, false), log)
	defer set.closeAll()
	if len(tools) != 0 {
		t.Fatalf("tools = %v", tools)
	}
	if time.Since(start) > time.Second {
		t.Errorf("startServers took %s", time.Since(start))
	}
}
