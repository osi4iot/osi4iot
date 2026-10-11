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
	hashedLlmProviderApiKey: string;
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