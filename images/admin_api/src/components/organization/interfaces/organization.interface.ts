import { OrgRoleOption } from "./orgRoleOptions";

export default interface IOrganization {
	id: number;
	name: string;
	acronym: string;
	role: OrgRoleOption;
	city: string;
	country: string;
	buildingId: number;
	orgHash: string;
	mqttAccessControl: string;
	llmEnabled: boolean;
	llmProviderUrl: string;
	// "openai" (any OpenAI-compatible API: OpenAI, OpenRouter, Groq...),
	// "anthropic", "google", "ollama", "azure" or "deepseek".
	llmProviderType: string;
	// The models the organization's AI nodes may use; empty: all the
	// provider offers.
	llmAllowedModels: string[];
	hashedLlmProviderApiKey: string;
	gpuUsageEnabled: boolean;
	ragEnabled?: boolean;
	telegramEnabled: boolean;
	hashedTelegramBotToken: string;
	hashedTelegramWebhookSecretToken: string;
}

export interface IOrganizationWichTheLoggedUserIsUser {
	id: number;
	name: string;
	acronym: string;
	role: OrgRoleOption;
	city: string;
	country: string;
	buildingId: number;
	roleInOrg: string;
}