package nodes

import (
	"strings"
)

// The LLM model of an AI node.
//
// The organization has one LLM provider: a type (the API pipelines
// talks to), a URL and a key. The node stores the model id the provider
// knows, as its model list shows it: "gpt-4o" on OpenAI,
// "anthropic/claude-sonnet-4.5" on OpenRouter, "llama3.1:8b" on Ollama.
// The agent engines take "<type>:<id>".
//
// Nodes made before stored the provider in the model ("openai:gpt-4o");
// those are used as they are.

// llmProviderPrefixes are the providers a stored model may start with.
var llmProviderPrefixes = map[string]bool{
	"openai": true, "anthropic": true, "google": true, "gemini": true,
	"ollama": true, "azure": true, "deepseek": true,
}

// splitLegacyLlmModel returns the provider and id of a model stored as
// "<provider>:<id>"; ok is false for a bare id. Only a known provider
// counts: Ollama's ids have a colon of their own ("llama3.1:8b").
func splitLegacyLlmModel(model string) (provider, id string, ok bool) {
	p, rest, found := strings.Cut(model, ":")
	if !found || !llmProviderPrefixes[strings.ToLower(p)] {
		return "", model, false
	}
	return strings.ToLower(p), rest, true
}

// namesOpenAIModelsWithPrefix: providers whose ids for OpenAI's models
// are openai/<model> (Groq for OpenAI's open models, OpenRouter for all
// of them), where nodes made before stored openai:<model>.
func namesOpenAIModelsWithPrefix(url string) bool {
	u := strings.ToLower(url)
	return strings.Contains(u, "api.groq.com") || strings.Contains(u, "openrouter.ai")
}

// resolveLlmModel gives the "<type>:<id>" the agent engines take.
func resolveLlmModel(model, providerType, providerURL string) string {
	model = strings.TrimSpace(model)
	if provider, id, ok := splitLegacyLlmModel(model); ok {
		if provider == "openai" && namesOpenAIModelsWithPrefix(providerURL) && !strings.Contains(id, "/") {
			return "openai:openai/" + id
		}
		return provider + ":" + id
	}
	providerType = strings.ToLower(strings.TrimSpace(providerType))
	if providerType == "" {
		providerType = "openai"
	}
	return providerType + ":" + model
}

// llmModelID gives the id the provider knows, for the nodes that call an
// OpenAI-compatible API themselves (Translator).
func llmModelID(model, providerURL string) string {
	model = strings.TrimSpace(model)
	if provider, id, ok := splitLegacyLlmModel(model); ok {
		if provider == "openai" && namesOpenAIModelsWithPrefix(providerURL) && !strings.Contains(id, "/") {
			return "openai/" + id
		}
		return id
	}
	return model
}

// defaultLlmModel is the model of a node that has none: the
// organization's first allowed model, or the platform's default.
func defaultLlmModel(allowed []string, platformDefault string) string {
	for _, m := range allowed {
		if strings.TrimSpace(m) != "" {
			return strings.TrimSpace(m)
		}
	}
	return platformDefault
}
