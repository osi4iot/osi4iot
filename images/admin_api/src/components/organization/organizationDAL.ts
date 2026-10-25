import pool, { readQuery } from "../../config/dbconfig";
import CreateOrganizationDto from "./interfaces/organization.dto";
import IOrganization, { IOrganizationWichTheLoggedUserIsUser } from "./interfaces/organization.interface";
import grafanaApi from "../../GrafanaApi";
import { decrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import CreateUserDto from "../user/interfaces/User.dto";
import { createOrganizationUsers, getUsersIdByEmailsArray } from "../user/userDAL";
import IUser from "../user/interfaces/User.interface";
import { addMembersToGroup, getDefaultOrgGroup, udpateRoleMemberInGroup } from "../group/groupDAL";
import CreateGroupMemberDto from "../group/interfaces/groupMember.dto";
import { RoleInGroupOption } from "../group/interfaces/RoleInGroupOptions";
import IMessage from "../../GrafanaApi/interfaces/Message";
import IUserInOrg from "../user/interfaces/UserInOrg.interface";
import IGroupMember from "../group/interfaces/GroupMember.interface";
import natsClient from "../../config/natsConfig";
import { normalizeLlmProviderType } from "./llmModels";

// Trimmed, without empty or repeated ids.
const normalizeLlmAllowedModels = (models?: string[]): string[] =>
	Array.from(new Set((models || []).map((m) => String(m).trim()).filter((m) => m !== "")));

export const exitsOrganizationWithName = async (orgName: string): Promise<boolean> => {
	const result = await readQuery("SELECT COUNT(*) FROM grafanadb.org WHERE name = $1", [orgName]);
	return result.rows[0].count !== 0;
};

export const exitsOrganizationWithAcronym = async (orgAcronym: string): Promise<boolean> => {
	const result = await readQuery("SELECT COUNT(*) FROM grafanadb.org WHERE acronym = $1", [orgAcronym]);
	return result.rows[0].count !== 0;
};

export const updateOrganizationByProp = async (
	propName: string,
	propValue: string | number,
	orgData: Partial<CreateOrganizationDto>,
	action = "update"
): Promise<void> => {
	const query = `UPDATE grafanadb.org SET name = $1, acronym = $2, role = $3, 
	building_id = $4, mqtt_access_control = $5, llm_enabled = $6, 
	llm_provider_url = $7, hashed_llm_provider_api_key = $8,
	gpu_usage_enabled = $9, telegram_enabled = $10,
	hashed_telegram_bot_token = $11, hashed_telegram_webhook_secret_token = $12,
	llm_provider_type = $13, llm_allowed_models = $14, rag_enabled = $15
	WHERE grafanadb.org.${propName} = $16 RETURNING *;`;
	const queryArray = [
		orgData.name,
		orgData.acronym,
		orgData.role,
		orgData.buildingId,
		orgData.mqttAccessControl,
		orgData.llmEnabled,
		orgData.llmProviderUrl,
		orgData.hashedLlmProviderApiKey,
		orgData.gpuUsageEnabled,
		orgData.telegramEnabled,
		orgData.hashedTelegramBotToken,
		orgData.hashedTelegramWebhookSecretToken,
		normalizeLlmProviderType(orgData.llmProviderType),
		normalizeLlmAllowedModels(orgData.llmAllowedModels),
		orgData.ragEnabled === true,
		propValue,
	];
	const result = await pool.query(query, queryArray);
	const orgId = result.rows[0].id as number;
	if (action === "create") {
		await natsClient.jsPublish("org", "create", orgId);
	} else if (action === "update") {
		await natsClient.jsPublish("org", "update", orgId);
	}
};

export const updateOrganizationHashById = async (orgId: number, newOrgHash: string): Promise<void> => {
	const query = `UPDATE grafanadb.org SET org_hash = $1 WHERE id = $2;`;
	const queryArray = [newOrgHash, orgId];
	await pool.query(query, queryArray);
	await natsClient.jsPublish("org", "update", orgId);
};

export const insertOrganizationToken = async (orgId: number, apiKeyId: number, hashedApiKey: string): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.org_token (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`, [
		orgId,
		apiKeyId,
		hashedApiKey,
	]);
};

export const getOrganizations = async (): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role, 
	                grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					ORDER BY grafanadb.org.id ASC;`;
	const result = await readQuery(query);
	return result.rows as IOrganization[];
};

export const getOrganizationsFullInfo = async (): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role, 
	                grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					hashed_llm_provider_api_key AS "hashedLlmProviderApiKey",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled",
					hashed_telegram_bot_token AS "hashedTelegramBotToken",
					hashed_telegram_webhook_secret_token AS "hashedTelegramWebhookSecretToken"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					ORDER BY grafanadb.org.id ASC;`;
	const result = await readQuery(query);
	return result.rows as IOrganization[];
};

export const getOrganizationsWithIdsArray = async (orgIdsArray: number[]): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role, 
					grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					telegram_enabled AS "telegramEnabled",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					WHERE grafanadb.org.id = ANY($1::integer[])
					ORDER BY grafanadb.org.id ASC;`;
	const result = await readQuery(query, [orgIdsArray]);
	return result.rows as IOrganization[];
};

export const getNumOrganizations = async (): Promise<number> => {
	const query = `SELECT COUNT(*) FROM grafanadb.org;`;
	const result = await readQuery(query);
	return parseInt(result.rows[0].count, 10);
};

export const getOrganizationByProp = async (propName: string, propValue: string | number): Promise<IOrganization> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role,
					grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					WHERE grafanadb.org.${propName} = $1;`;
	const result = await readQuery(query, [propValue]);
	return result.rows[0] as IOrganization;
};

export const getOrganizationFullInfoByProp = async (
	propName: string,
	propValue: string | number
): Promise<IOrganization> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role,
					grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					hashed_llm_provider_api_key AS "hashedLlmProviderApiKey",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled",
					hashed_telegram_bot_token AS "hashedTelegramBotToken",
					hashed_telegram_webhook_secret_token AS "hashedTelegramWebhookSecretToken"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					WHERE grafanadb.org.${propName} = $1;`;
	const result = await readQuery(query, [propValue]);
	return result.rows[0] as IOrganization;
};

export const getOrganizationKey = async (orgId: number): Promise<string> => {
	const query = `SELECT organization_key as "orgKey"
					FROM grafanadb.org_token WHERE org_id = $1;`;
	const result = await readQuery(query, [orgId]);
	const apiKey = decrypt(result.rows[0].orgKey);
	return apiKey;
};

export const addUsersToOrganizationAndMembersToDefaultOrgGroup = async (
	orgId: number,
	orgUsersArray: CreateUserDto[]
): Promise<IMessage[]> => {
	const msg_users = await grafanaApi.addUsersToOrganization(orgId, orgUsersArray);
	const usersAddedToOrg: CreateUserDto[] = [];
	msg_users.forEach((msg, index) => {
		const orgUser = orgUsersArray[index];
		if (msg.message === "User added to organization") usersAddedToOrg.push(orgUser);
	});
	await addOrgUsersToDefaultOrgGroup(orgId, usersAddedToOrg);
	return msg_users;
};

export const addAdminToOrganization = async (orgId: number, orgAdminArray: CreateUserDto[]): Promise<number[]> => {
	orgAdminArray.forEach((user) => (user.roleInOrg = "Admin"));
	const adminIdArray: number[] = [];
	orgAdminArray.forEach(() => adminIdArray.push(0));
	const usersIdArray = await getUsersIdByEmailsArray(orgAdminArray.map((user) => user.email));
	const emailsArray = usersIdArray.map((user) => user.email);
	const existingUserArray = orgAdminArray.filter((user) => emailsArray.indexOf(user.email) !== -1);
	const nonExistingUserArray = orgAdminArray.filter((user) => emailsArray.indexOf(user.email) === -1);
	if (nonExistingUserArray.length !== 0) {
		const msg_users = await createOrganizationUsers(orgId, nonExistingUserArray);
		orgAdminArray.forEach((user, index) => {
			for (let i = 0; i < nonExistingUserArray.length; i++) {
				if (nonExistingUserArray[i].email === user.email) adminIdArray[index] = msg_users[i].id;
			}
		});
	}

	if (existingUserArray.length !== 0) {
		const msg_users = await grafanaApi.addUsersToOrganization(orgId, existingUserArray);
		orgAdminArray.forEach((user, index) => {
			for (let i = 0; i < existingUserArray.length; i++) {
				if (existingUserArray[i].email === user.email) adminIdArray[index] = msg_users[i].userId;
			}
		});
	}
	return adminIdArray;
};

export const getOrganizationAdmin = async (orgId: number): Promise<Partial<IUser>[]> => {
	const query = `SELECT grafanadb.user.id, name, login, email
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.org_user.role = $2`;
	const result = await readQuery(query, [orgId, "Admin"]);
	return result.rows as Partial<IUser>[];
};

export const getOrganizationsManagedByUserId = async (userId: number): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role,
					grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id					
					WHERE grafanadb.org_user.user_id = $1 AND grafanadb.org_user.role = $2
					ORDER BY id ASC`;
	const result = await readQuery(query, [userId, "Admin"]);
	return result.rows as IOrganization[];
};

export const organizationsWhichTheLoggedUserIsUser = async (
	userId: number
): Promise<IOrganizationWichTheLoggedUserIsUser[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, 
	                grafanadb.org.acronym, grafanadb.org.role,
					grafanadb.building.city, grafanadb.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl",
					llm_enabled AS "llmEnabled",
					llm_provider_url AS "llmProviderUrl",
					llm_provider_type AS "llmProviderType",
					llm_allowed_models AS "llmAllowedModels",
					gpu_usage_enabled AS "gpuUsageEnabled",
					rag_enabled AS "ragEnabled",
					telegram_enabled AS "telegramEnabled"
					FROM grafanadb.org
					INNER JOIN grafanadb.building ON grafanadb.org.building_id = grafanadb.building.id
					INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id
					WHERE grafanadb.org_user.user_id = $1
					ORDER BY id ASC`;
	const result = await readQuery(query, [userId]);
	return result.rows as IOrganizationWichTheLoggedUserIsUser[];
};

export const addOrgUsersToDefaultOrgGroup = async (
	orgId: number,
	usersAddedToOrg: CreateUserDto[]
): Promise<IMessage> => {
	const group = await getDefaultOrgGroup(orgId);
	const groupMembersArray: CreateGroupMemberDto[] = [];
	usersAddedToOrg.forEach((user) => {
		const groupMember = {
			userId: user.id,
			firstName: user.firstName,
			surname: user.surname,
			email: user.email,
			roleInGroup: user.roleInOrg as RoleInGroupOption,
		};
		groupMembersArray.push(groupMember);
	});
	const message = await addMembersToGroup(group, groupMembersArray);
	return message;
};

export const updateOrgUserRoleInDefaultOrgGroup = async (
	orgId: number,
	user: IUserInOrg,
	newRoleInOrg: string
): Promise<IMessage> => {
	const group = await getDefaultOrgGroup(orgId);
	const groupMembersArray: CreateGroupMemberDto[] = [
		{
			userId: user.userId,
			firstName: user.firstName,
			surname: user.surname,
			email: user.email,
			roleInGroup: newRoleInOrg as RoleInGroupOption,
		},
	];

	const existentGroupMemberArray: IGroupMember[] = [
		{
			groupId: group.id,
			userId: user.userId,
			firstName: user.firstName,
			surname: user.surname,
			email: user.email,
			roleInGroup: user.roleInOrg as RoleInGroupOption,
		},
	];

	const message = await udpateRoleMemberInGroup(group, groupMembersArray, existentGroupMemberArray);
	return message;
};
