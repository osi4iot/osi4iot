package llmagent

import (
	"context"
	"fmt"
	"strings"

	"github.com/Ingenimax/agent-sdk-go/pkg/interfaces"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/anthropic"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/azureopenai"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/deepseek"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/gemini"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/ollama"
	"github.com/Ingenimax/agent-sdk-go/pkg/llm/openai"
	openaiapi "github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
)

// newLLM creates the client of a "provider:model" string, with the
// organization's provider URL and API key (the provider is the
// organization's provider type; see nodes/llmModel.go).
func newLLM(ctx context.Context, modelString, providerURL, apiKey string, log *sdkLogger) (interfaces.LLM, error) {
	provider, model, ok := strings.Cut(modelString, ":")
	if !ok || provider == "" || model == "" {
		return nil, fmt.Errorf("invalid model %q: expected provider:model, e.g. openai:gpt-4o", modelString)
	}
	url := strings.TrimRight(strings.TrimSpace(providerURL), "/")

	switch strings.ToLower(provider) {
	case "openai":
		// Also OpenAI-compatible APIs (Groq, OpenRouter, vLLM, LM Studio…)
		// through the provider URL.
		opts := []openai.Option{openai.WithModel(model), openai.WithLogger(log)}
		if url != "" {
			opts = append(opts, openai.WithBaseURL(url))
		}
		client := openai.NewClient(apiKey, opts...)
		// The same chat service, with the requests adapted to what each
		// model accepts (see paramFixer).
		base := url
		if base == "" {
			base = "https://api.openai.com/v1"
		}
		client.ChatService = openaiapi.NewChatService(
			option.WithAPIKey(apiKey),
			option.WithBaseURL(base),
			option.WithMiddleware(newParamFixer(log.log).middleware()),
		)
		return client, nil

	case "anthropic":
		opts := []anthropic.Option{anthropic.WithModel(model), anthropic.WithLogger(log)}
		if url != "" {
			// The client adds /v1/messages itself.
			opts = append(opts, anthropic.WithBaseURL(strings.TrimSuffix(url, "/v1")))
		}
		return anthropic.NewClient(apiKey, opts...), nil

	case "google", "gemini":
		// The Gemini API's own endpoint: the provider URL is not used.
		client, err := gemini.NewClient(ctx,
			gemini.WithAPIKey(apiKey),
			gemini.WithModel(model),
			gemini.WithLogger(log),
		)
		if err != nil {
			return nil, fmt.Errorf("creating the Gemini client: %w", err)
		}
		return client, nil

	case "ollama":
		opts := []ollama.Option{ollama.WithModel(model), ollama.WithLogger(log)}
		if url != "" {
			// Ollama's native API (/api/chat), not its OpenAI-compatible /v1.
			url = strings.TrimSuffix(strings.TrimSuffix(url, "/v1"), "/api")
			opts = append(opts, ollama.WithBaseURL(url))
		}
		return ollama.NewClient(opts...), nil

	case "azure":
		if url == "" {
			return nil, fmt.Errorf("azure: the provider URL (the Azure OpenAI endpoint) is required")
		}
		// model is the deployment name.
		return azureopenai.NewClient(apiKey, url, model, azureopenai.WithLogger(log)), nil

	case "deepseek":
		opts := []deepseek.Option{deepseek.WithModel(model), deepseek.WithLogger(log)}
		if url != "" {
			opts = append(opts, deepseek.WithBaseURL(url))
		}
		return deepseek.NewClient(apiKey, opts...), nil

	default:
		return nil, fmt.Errorf("unsupported LLM provider %q (supported: openai, anthropic, google, ollama, azure, deepseek)", provider)
	}
}
