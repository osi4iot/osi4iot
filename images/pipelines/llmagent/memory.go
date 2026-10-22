package llmagent

import (
	"context"
	"sync"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"
)

// turnMemory is the memory of one prompt: the user's stored conversation
// plus what the tool-calling loop adds while answering (the prompt, the
// assistant's tool calls and the tools' results).
//
// It lives only while the prompt is answered. What is kept afterwards is
// decided by the host: the prompt and the final answer, through
// Config.SaveTurn.
type turnMemory struct {
	mu       sync.Mutex
	messages []interfaces.Message
}

func newTurnMemory(history []HistoryMessage) *turnMemory {
	m := &turnMemory{messages: make([]interfaces.Message, 0, len(history)+8)}
	for _, h := range history {
		var role interfaces.MessageRole
		switch h.Role {
		case "user":
			role = interfaces.MessageRoleUser
		case "assistant":
			role = interfaces.MessageRoleAssistant
		default:
			continue // system and tool messages are not part of the stored chat
		}
		if h.Content == "" {
			continue
		}
		m.messages = append(m.messages, interfaces.Message{Role: role, Content: h.Content})
	}
	return m
}

func (m *turnMemory) AddMessage(_ context.Context, message interfaces.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, message)
	return nil
}

func (m *turnMemory) GetMessages(_ context.Context, options ...interfaces.GetMessagesOption) ([]interfaces.Message, error) {
	var opts interfaces.GetMessagesOptions
	for _, o := range options {
		o(&opts)
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]interfaces.Message, 0, len(m.messages))
	for _, msg := range m.messages {
		if len(opts.Roles) > 0 && !containsRole(opts.Roles, msg.Role) {
			continue
		}
		out = append(out, msg)
	}
	if opts.Limit > 0 && len(out) > opts.Limit {
		out = out[len(out)-opts.Limit:]
	}
	return out, nil
}

func (m *turnMemory) Clear(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = nil
	return nil
}

func containsRole(roles []string, role interfaces.MessageRole) bool {
	for _, r := range roles {
		if r == string(role) {
			return true
		}
	}
	return false
}
