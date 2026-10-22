package nodes

import "testing"

func TestResolveLlmModel(t *testing.T) {
	const openrouter = "https://openrouter.ai/api/v1"
	const groq = "https://api.groq.com/openai/v1"
	cases := []struct {
		model, providerType, url, want string
	}{
		// Bare ids take the organization's provider type.
		{"anthropic/claude-sonnet-4.5", "openai", openrouter, "openai:anthropic/claude-sonnet-4.5"},
		{"meta-llama/llama-3.3-70b-instruct:free", "openai", openrouter, "openai:meta-llama/llama-3.3-70b-instruct:free"},
		{"gpt-4o", "", "https://api.openai.com/v1", "openai:gpt-4o"},
		{"llama3.1:8b", "ollama", "http://ollama:11434", "ollama:llama3.1:8b"},
		{"claude-sonnet-4-5", "anthropic", "", "anthropic:claude-sonnet-4-5"},
		{"openai/gpt-oss-120b", "openai", groq, "openai:openai/gpt-oss-120b"},
		// Models stored with their provider are kept.
		{"openai:gpt-4o-mini", "openai", "https://api.openai.com/v1", "openai:gpt-4o-mini"},
		{"anthropic:claude-3-7-sonnet", "openai", openrouter, "anthropic:claude-3-7-sonnet"},
		// ...with Groq's and OpenRouter's naming of OpenAI's models.
		{"openai:gpt-oss-120b", "openai", groq, "openai:openai/gpt-oss-120b"},
		{"openai:gpt-4o-mini", "openai", openrouter, "openai:openai/gpt-4o-mini"},
		{"openai:openai/gpt-oss-20b", "openai", groq, "openai:openai/gpt-oss-20b"},
	}
	for _, c := range cases {
		if got := resolveLlmModel(c.model, c.providerType, c.url); got != c.want {
			t.Errorf("resolveLlmModel(%q, %q, %q) = %q, want %q", c.model, c.providerType, c.url, got, c.want)
		}
	}
}

func TestLlmModelID(t *testing.T) {
	cases := []struct{ model, url, want string }{
		{"openai:gpt-4o-mini", "https://api.openai.com/v1", "gpt-4o-mini"},
		{"anthropic/claude-sonnet-4.5", "https://openrouter.ai/api/v1", "anthropic/claude-sonnet-4.5"},
		{"openai:gpt-4o-mini", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini"},
		{"openai:gpt-oss-120b", "https://api.groq.com/openai/v1", "openai/gpt-oss-120b"},
		{"llama3.1:8b", "http://ollama:11434/v1", "llama3.1:8b"},
	}
	for _, c := range cases {
		if got := llmModelID(c.model, c.url); got != c.want {
			t.Errorf("llmModelID(%q, %q) = %q, want %q", c.model, c.url, got, c.want)
		}
	}
}

func TestDefaultLlmModel(t *testing.T) {
	if got := defaultLlmModel([]string{"", " openai/gpt-4o-mini "}, "openai:gpt-oss-120b"); got != "openai/gpt-4o-mini" {
		t.Errorf("got %q", got)
	}
	if got := defaultLlmModel(nil, "openai:gpt-oss-120b"); got != "openai:gpt-oss-120b" {
		t.Errorf("got %q", got)
	}
}
