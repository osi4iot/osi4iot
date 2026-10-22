import needle from "needle";
import { decrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import IOrganization from "./interfaces/organization.interface";

// LLM providers of the organizations
//
// An organization has one LLM provider: its type, URL and API key. The
// type says which API pipelines talks to; "openai" is any
// OpenAI-compatible API: OpenAI itself, OpenRouter (one key for the
// models of OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek...), Groq,
// vLLM, LM Studio... A node stores only the model id (e.g.
// "anthropic/claude-sonnet-4.5" on OpenRouter) and pipelines composes
// "<type>:<id>".

export const LLM_PROVIDER_TYPES = ["openai", "anthropic", "google", "ollama", "azure", "deepseek"] as const;
export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];
export const DEFAULT_LLM_PROVIDER_TYPE: LlmProviderType = "openai";

export interface ILlmModelInfo {
	id: string;
	name: string;
	contextLength?: number;
	// USD per million tokens, when the provider says (OpenRouter).
	inputPricePerMTokens?: number;
	outputPricePerMTokens?: number;
	// null: the provider does not say whether the model can call tools.
	supportsTools: boolean | null;
}

export interface ILlmModelList {
	providerType: LlmProviderType;
	// false: the provider gave no list (Azure, an unreachable URL...);
	// the model is then typed by hand.
	listed: boolean;
	error?: string;
	models: ILlmModelInfo[];
}

const CACHE_TTL_MS = 60 * 60 * 1000; // provider lists change rarely
const REQUEST_TIMEOUT_MS = 15000;

interface ICacheEntry {
	expires: number;
	list: ILlmModelList;
}
const cache = new Map<string, ICacheEntry>();

// Models that are not chat models (OpenAI's and Groq's /models list
// everything: embeddings, speech, images...).
const NON_CHAT_MODEL = /(embed|whisper|tts|dall-e|moderation|transcribe|davinci|babbage|text-similarity|guard|image|audio|realtime|search-preview|sora)/i;

const trimSlash = (url: string): string => (url || "").trim().replace(/\/+$/, "");

interface IListedModel {
	id?: string;
	name?: string;
	display_name?: string;
	displayName?: string;
	context_length?: number;
	context_window?: number;
	inputTokenLimit?: number;
	pricing?: { prompt?: string; completion?: string };
	supported_parameters?: string[];
	supportedGenerationMethods?: string[];
}

interface IModelsResponse {
	data?: IListedModel[];
	models?: IListedModel[];
}

const httpGetJSON = async (url: string, headers: Record<string, string>): Promise<IModelsResponse> => {
	const res = await needle("get", url, null, {
		headers,
		json: true,
		open_timeout: REQUEST_TIMEOUT_MS,
		response_timeout: REQUEST_TIMEOUT_MS,
		read_timeout: REQUEST_TIMEOUT_MS,
	});
	if (res.statusCode !== 200) {
		const detail = typeof res.body === "object" ? JSON.stringify(res.body).slice(0, 300) : String(res.body).slice(0, 300);
		throw new Error(`HTTP ${res.statusCode} from ${url.split("?")[0]}: ${detail}`);
	}
	return (res.body || {}) as IModelsResponse;
};

const perMillion = (pricePerToken: unknown): number | undefined => {
	const n = typeof pricePerToken === "string" ? parseFloat(pricePerToken) : (pricePerToken as number);
	return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1000) / 1000 : undefined;
};

const isOpenRouter = (url: string): boolean => /(^|\/\/)([a-z0-9-]+\.)*openrouter\.ai(\/|$)/i.test(url);

const listOpenAICompatible = async (url: string, apiKey: string): Promise<ILlmModelInfo[]> => {
	const base = trimSlash(url) || "https://api.openai.com/v1";
	if (isOpenRouter(base)) {
		// OpenRouter says which models can call tools: only those can use
		// the agents' MCP tools.
		const routerBody = await httpGetJSON(`${base}/models?supported_parameters=tools`, {
			Authorization: `Bearer ${apiKey}`,
		});
		return (routerBody.data || []).map((m) => ({
			id: m.id,
			name: m.name || m.id,
			contextLength: m.context_length ?? undefined,
			inputPricePerMTokens: perMillion(m.pricing?.prompt),
			outputPricePerMTokens: perMillion(m.pricing?.completion),
			supportsTools: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes("tools") : true,
		}));
	}
	const body = await httpGetJSON(`${base}/models`, { Authorization: `Bearer ${apiKey}` });
	return (body.data || [])
		.filter((m) => typeof m.id === "string" && !NON_CHAT_MODEL.test(m.id))
		.map((m) => ({
			id: m.id,
			name: m.id,
			contextLength: m.context_window ?? m.context_length ?? undefined,
			supportsTools: null as boolean | null,
		}));
};

const listAnthropic = async (url: string, apiKey: string): Promise<ILlmModelInfo[]> => {
	const base = trimSlash(url).replace(/\/v1$/, "") || "https://api.anthropic.com";
	const body = await httpGetJSON(`${base}/v1/models?limit=1000`, {
		"x-api-key": apiKey,
		"anthropic-version": "2023-06-01",
	});
	return (body.data || []).map((m) => ({
		id: m.id,
		name: m.display_name || m.id,
		supportsTools: true,
	}));
};

const listGoogle = async (apiKey: string): Promise<ILlmModelInfo[]> => {
	const body = await httpGetJSON(
		`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
		{}
	);
	return (body.models || [])
		.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
		.filter((m) => !NON_CHAT_MODEL.test(m.name || ""))
		.map((m) => ({
			id: String(m.name).replace(/^models\//, ""),
			name: m.displayName || m.name,
			contextLength: m.inputTokenLimit ?? undefined,
			supportsTools: null as boolean | null,
		}));
};

const listOllama = async (url: string): Promise<ILlmModelInfo[]> => {
	const base = trimSlash(url).replace(/\/v1$/, "").replace(/\/api$/, "") || "http://localhost:11434";
	const body = await httpGetJSON(`${base}/api/tags`, {});
	return (body.models || []).map((m) => ({ id: m.name, name: m.name, supportsTools: null as boolean | null }));
};

const listDeepSeek = async (url: string, apiKey: string): Promise<ILlmModelInfo[]> => {
	const base = trimSlash(url) || "https://api.deepseek.com";
	const body = await httpGetJSON(`${base}/models`, { Authorization: `Bearer ${apiKey}` });
	return (body.data || []).map((m) => ({ id: m.id, name: m.id, supportsTools: true }));
};

export const normalizeLlmProviderType = (type?: string): LlmProviderType => {
	const t = (type || "").trim().toLowerCase() as LlmProviderType;
	return LLM_PROVIDER_TYPES.includes(t) ? t : DEFAULT_LLM_PROVIDER_TYPE;
};

// The models the organization's provider offers, as the provider lists
// them (cached for an hour). Never throws: a provider that cannot be
// asked gives listed=false and the error.
export const getProviderLlmModels = async (org: IOrganization, refresh = false): Promise<ILlmModelList> => {
	const providerType = normalizeLlmProviderType(org.llmProviderType);
	const url = trimSlash(org.llmProviderUrl);
	const key = `${org.id}|${providerType}|${url}|${org.hashedLlmProviderApiKey || ""}`;
	const cached = cache.get(key);
	if (!refresh && cached && cached.expires > Date.now()) return cached.list;

	let list: ILlmModelList;
	if (!org.llmEnabled) {
		list = { providerType, listed: false, error: "LLM is not enabled for this organization", models: [] };
	} else {
		const apiKey = org.hashedLlmProviderApiKey ? decrypt(org.hashedLlmProviderApiKey) : "";
		list = await listProviderModels(providerType, url, apiKey);
	}
	// Failures are cached for a minute only: a typo in the URL is
	// usually fixed at once.
	cache.set(key, { expires: Date.now() + (list.error ? 60 * 1000 : CACHE_TTL_MS), list });
	return list;
};

// The models of provider settings not saved yet (the organization forms
// before saving). Not cached. Never throws.
export const previewProviderLlmModels = async (
	providerTypeName: string | undefined,
	providerUrl: string | undefined,
	apiKey: string
): Promise<ILlmModelList> =>
	listProviderModels(normalizeLlmProviderType(providerTypeName), trimSlash(providerUrl || ""), apiKey);

// Asks the provider for its models. Never throws: a provider that cannot
// be asked gives listed=false and the error.
const listProviderModels = async (
	providerType: LlmProviderType,
	url: string,
	apiKey: string
): Promise<ILlmModelList> => {
	try {
		let models: ILlmModelInfo[];
		switch (providerType) {
			case "anthropic":
				models = await listAnthropic(url, apiKey);
				break;
			case "google":
				models = await listGoogle(apiKey);
				break;
			case "ollama":
				models = await listOllama(url);
				break;
			case "deepseek":
				models = await listDeepSeek(url, apiKey);
				break;
			case "azure":
				// Azure lists deployments only through its management API, not
				// with the inference key: the deployment name is typed by hand.
				models = [];
				break;
			default:
				models = await listOpenAICompatible(url, apiKey);
		}
		models = models
			.filter((m) => typeof m.id === "string" && m.id !== "")
			.map((m) => ({ ...m, name: m.name || m.id }))
			.sort((a, b) => a.id.localeCompare(b.id));
		return { providerType, listed: providerType !== "azure", models };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { providerType, listed: false, error: message, models: [] };
	}
};

// The models a group's pipelines may use: the provider's list, narrowed
// to the organization's allowed models when it has any. Allowed models
// the provider does not list (or that could not be listed) are kept, so
// the platform admin's choice always shows.
export const getAllowedLlmModels = async (org: IOrganization): Promise<ILlmModelList> => {
	const list = await getProviderLlmModels(org);
	const allowed = (org.llmAllowedModels || []).filter((m) => m && m.trim() !== "");
	if (allowed.length === 0) return list;
	const byId = new Map(list.models.map((m) => [m.id, m]));
	const models = allowed.map((id) => byId.get(id) || { id, name: id, supportsTools: null });
	return { ...list, listed: true, models };
};
