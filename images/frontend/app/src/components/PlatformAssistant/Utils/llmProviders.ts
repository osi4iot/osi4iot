// LLM providers of the organizations (see admin_api's llmModels.ts).
//
// "openai" is any OpenAI-compatible API: OpenAI itself, OpenRouter (one
// key for the models of OpenAI, Anthropic, Google, Meta, Mistral,
// DeepSeek...), Groq, vLLM, LM Studio...

export const LLM_PROVIDER_TYPE_OPTIONS = [
    { label: "OpenAI-compatible (OpenAI, OpenRouter, Groq, vLLM...)", value: "openai" },
    { label: "Anthropic", value: "anthropic" },
    { label: "Google Gemini", value: "google" },
    { label: "Ollama", value: "ollama" },
    { label: "Azure OpenAI", value: "azure" },
    { label: "DeepSeek", value: "deepseek" },
];

// The URL a provider type usually has, offered when the type changes.
export const LLM_PROVIDER_DEFAULT_URLS: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com",
    google: "https://generativelanguage.googleapis.com",
    ollama: "http://ollama:11434",
    azure: "https://YOUR-RESOURCE.openai.azure.com",
    deepseek: "https://api.deepseek.com",
};

export const isDefaultLlmProviderUrl = (url: string): boolean =>
    url === "" ||
    url === "https://api.openai.com/v1" ||
    Object.values(LLM_PROVIDER_DEFAULT_URLS).includes(url);

export interface ILlmModelInfo {
    id: string;
    name: string;
    contextLength?: number;
    inputPricePerMTokens?: number;
    outputPricePerMTokens?: number;
    supportsTools: boolean | null;
}

export interface ILlmModelList {
    providerType: string;
    listed: boolean;
    error?: string;
    models: ILlmModelInfo[];
    allowedModels?: string[];
}

// The allowed models are edited as text, one id per line.
export const parseAllowedModels = (text: string): string[] =>
    Array.from(
        new Set(
            (text || "")
                .split(/[\n,]/)
                .map((m) => m.trim())
                .filter((m) => m !== ""),
        ),
    );

export const formatAllowedModels = (models?: string[]): string => (models || []).join("\n");

export const formatLlmModelLabel = (m: ILlmModelInfo): string => {
    const details: string[] = [];
    if (m.name && m.name !== m.id) details.push(m.name);
    if (m.contextLength) details.push(`${Math.round(m.contextLength / 1000)}k ctx`);
    if (m.inputPricePerMTokens !== undefined && m.outputPricePerMTokens !== undefined) {
        details.push(`$${m.inputPricePerMTokens}/$${m.outputPricePerMTokens} per M tokens`);
    }
    return details.length ? `${m.id} — ${details.join(", ")}` : m.id;
};
