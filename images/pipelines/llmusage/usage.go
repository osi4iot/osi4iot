// Package llmusage measures what the nodes consume of their organization's LLM provider (tokens, audio
// seconds, characters) and sends it to admin_api, which keeps one row per operation (an AI agent prompt
// with all its tool iterations, a translation, a transcription, a speech synthesis).
//
// The tokens are read from the provider's HTTP responses (Transport), so every request counts, also the
// tool-calling iterations of an AI agent prompt, whatever the provider: OpenAI and compatible APIs
// (OpenRouter, Groq, vLLM…), Anthropic, Gemini, Ollama and DeepSeek. An operation collects its requests
// with a Counter carried in the request context.
package llmusage

import (
	"context"
	"sync"
)

// Usage is what one or more requests to a provider consumed.
type Usage struct {
	Requests        int     `json:"requests"`
	InputTokens     int64   `json:"inputTokens"`     // cached ones included
	OutputTokens    int64   `json:"outputTokens"`    // reasoning ones included
	CacheReadTokens int64   `json:"cacheReadTokens"` // input tokens read from the provider's cache
	ReasoningTokens int64   `json:"reasoningTokens"`
	AudioSeconds    float64 `json:"audioSeconds"`
	Characters      int     `json:"characters"`
	Model           string  `json:"model"`
	ProviderHost    string  `json:"providerHost"`
}

// Add adds o to u (the model and host of u are kept when set).
func (u *Usage) Add(o Usage) {
	u.Requests += o.Requests
	u.InputTokens += o.InputTokens
	u.OutputTokens += o.OutputTokens
	u.CacheReadTokens += o.CacheReadTokens
	u.ReasoningTokens += o.ReasoningTokens
	u.AudioSeconds += o.AudioSeconds
	u.Characters += o.Characters
	if u.Model == "" {
		u.Model = o.Model
	}
	if u.ProviderHost == "" {
		u.ProviderHost = o.ProviderHost
	}
}

// Empty: nothing was consumed (no request reached the provider).
func (u Usage) Empty() bool {
	return u.Requests == 0 && u.InputTokens == 0 && u.OutputTokens == 0 && u.AudioSeconds == 0 && u.Characters == 0
}

// Tokens is input plus output.
func (u Usage) Tokens() int64 { return u.InputTokens + u.OutputTokens }

// Counter collects the usage of the requests of one operation (see WithCounter). Safe for concurrent use.
type Counter struct {
	mu    sync.Mutex
	usage Usage
}

func (c *Counter) add(u Usage) {
	c.mu.Lock()
	c.usage.Add(u)
	c.mu.Unlock()
}

// Usage is what has been collected so far.
func (c *Counter) Usage() Usage {
	if c == nil {
		return Usage{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.usage
}

type counterKey struct{}

// WithCounter returns a context whose provider requests (made through Transport) are counted.
func WithCounter(ctx context.Context) (context.Context, *Counter) {
	c := &Counter{}
	return context.WithValue(ctx, counterKey{}, c), c
}

func counterFrom(ctx context.Context) *Counter {
	if ctx == nil {
		return nil
	}
	c, _ := ctx.Value(counterKey{}).(*Counter)
	return c
}
