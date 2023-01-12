/* eslint-disable @typescript-eslint/no-unsafe-return */
import needle from "needle";
import IFolder from "./interfaces/Folder";
import IFolderDTO from "./interfaces/FolderDTO";
import IFolderPermissionDTO from "./interfaces/FolderPermissionDTO";
import IMessage from "./interfaces/Message";
import ITeam from "./interfaces/Team";
import ITeamDTO from "./interfaces/TeamDTO";
import TeamMember from "./interfaces/TeamMember";
import TeamsWithPaging from "./interfaces/TeamsWithPaging";
import IUserId from "./interfaces/UserId";
import IDashboardApi from "./dashboardApi.interface";
import IOrganizationGrafana from "./interfaces/IOrganizationGrafana";
import IOrganizationGrafanaDTO from "./interfaces/IOrganizationGrafanaDTO";
import IApiKey from "./interfaces/ApiKey";
import IApiKeyDTO from "./interfaces/ApiKeyDTO";
import { logger } from "../config/winston";
import IUserInOrgGrafana from "./interfaces/UserInOrgGrafana.interface";
import IUserGlobalGrafana from "./interfaces/UserGlobalGrafana.interface";
import IPlatformStatistics from "./interfaces/PlatformStatistics";
import IOptionsToken from "./interfaces/OptionsToken";
import INotificationChannel from "./interfaces/NotificationChannel";
import { updateNotificationChannelSettings } from "../components/group/groupDAL";
import CreateUserDto from "../components/user/interfaces/User.dto";
import wait from "../utils/helpers/wait";
import process_env from "../config/api_config";

const GrafanaApiURL = "grafana:5000/api"
const optionsBasicAuthApiAdmin = {
	username: "api_admin",
	password: process_env.PLATFORM_ADMIN_PASSWORD,
	json: true
}

const optionsBasicAuthOrgAdmin = (orgId: number) => {
	return {
		username: `org_${orgId}_api_admin`,
		password: process_env.PLATFORM_ADMIN_PASSWORD,
		json: true
	}
}

export default class GrafanaApi implements IDashboardApi {
	async getPlatformStatistics(): Promise<IPlatformStatistics> {
		const url = `${GrafanaApiURL}/admin/stats`;
		const statistics = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Platform statistics could not be geted: %s", err.message));
		return statistics;
	}

	async createOrganization(orgData: IOrganizationGrafanaDTO): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs`;
		const message = await needle('post', url, orgData, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization ${orgData.name} could not be created: %s", err.message));
		return message;
	}

	async getOrganizations(): Promise<IOrganizationGrafana[]> {
		const url = `${GrafanaApiURL}/orgs`;
		const organizations = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organizations could not be found: %s", err.message));
		return organizations;
	}

	async getOrganizationById(orgId: number): Promise<IOrganizationGrafana> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const organization = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be found: %s", err.message));
		return organization;
	}

	async getOrganizationByName(orgName: string): Promise<IOrganizationGrafana> {
		const url = `${GrafanaApiURL}/orgs/${orgName}`;
		const organization = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with name=${orgName} could not be found: %s", err.message));
		return organization;
	}

	async updateOrganizationById(orgId: number, newName: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const newOrgName = { name: newName };
		const message = await needle('put', url, newOrgName, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be updated: %s", err.message));
		return message;
	}

	async deleteOrganizationById(orgId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const message = await needle('delete', url, null, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be deleted: %s", err.message));
		return message;
	}

	async switchOrgContextForAdmin(newOrgId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/user/using/${newOrgId}`;
		const message = await needle('post', url, null, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Context to org. id=${newOrgId} could not be switched: %s", err.message));
		return message;
	}

	async createApiKeyToken(apiKeyData: IApiKeyDTO): Promise<IApiKey> {
		const url = `${GrafanaApiURL}/auth/keys`;
		const apikey = await needle('post', url, apiKeyData, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Api token could not be created: %s", err.message));
		return apikey;
	}

	async getUsers(): Promise<IUserGlobalGrafana[]> {
		const url = `${GrafanaApiURL}/users`;
		const users = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users could not get: %s", err.message));
		return users;
	}

	async getOrganizationUsers(orgId: number): Promise<IUserInOrgGrafana[]> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users`;
		const users = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users could not get: %s", err.message));
		return users;
	}

	async getUsersWithPaging(perpage: number, page: number, query: string): Promise<IUserGlobalGrafana[]> {
		const base_url = `${GrafanaApiURL}/users/search?`;
		let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
		url = query ? `${url}&query=${query}` : url;
		const users = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users with paging could not be geted: %s", err.message));
		return users;
	}

	async getUserByLoginOrEmail(loginOrEmail: string): Promise<IUserGlobalGrafana> {
		const url = `${GrafanaApiURL}/users/lookup?loginOrEmail=${loginOrEmail}`;
		const user = await needle('get', url, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users with login or email=${loginOrEmail} could not be geted: %s", err.message));
		return user;
	}

	async createUser(user: CreateUserDto): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users`;
		const message = await needle('post', url, user, optionsBasicAuthApiAdmin)
			.then(res => (res.body))
			.catch(err => logger.log("error", "User could not be created: %s", err.message));
		return message;
	}

	async createOrgApiAdminUser(orgId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users`;

		const user = {
			name: `org_${orgId}_api_admin`,
			login: `org_${orgId}_api_admin`,
			email: `org_${orgId}_api_admin@test.com`,
			password: process_env.PLATFORM_ADMIN_PASSWORD,
			OrgId: orgId,
		}
		const message: IMessage = await needle('post', url, user, optionsBasicAuthApiAdmin)
			.then(res => (res.body))
			.catch(err => logger.log("error", "User could not be created: %s", err.message));

		if (message.message === 'User created') {
			await this.changeUserRoleInOrganization(orgId, message.id, "Admin");
		}
		return message;
	}

	async giveGrafanaAdminPermissions(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/permissions`;
		const body = { isGrafanaAdmin: true };
		const grafanaAdminBasicAuthOptions = {
			username: 'api_admin',
			password: process_env.GRAFANA_ADMIN_PASSWORD,
			json: true
		}
		const message = await needle('put', url, body, grafanaAdminBasicAuthOptions)
			.then(res => (res.body.message))
			.catch(err => logger.log("error", "Grafana admin permission could not be given: %s", err.message));
		return message;
	}

	async addUserToOrganization(orgId: number, userEmail: string, roleInOrg: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users`;
		const userData = { loginOrEmail: userEmail, role: roleInOrg };
		const user_message = await needle('post', url, userData, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "User could not be added to the organization: %s", err.message));
		return user_message;
	}

	async addUsersToOrganization(orgId: number, usersData: CreateUserDto[]): Promise<IMessage[]> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users`;
		const usersAddedQueries = [];
		for (let i = 0; i < usersData.length; i++) {
			const userData = { loginOrEmail: usersData[i].email, role: usersData[i].roleInOrg };
			usersAddedQueries[i] =
				needle('post', url, userData, optionsBasicAuthApiAdmin)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be added to the organization: %s", err.message));

		}

		const msg_users = await Promise.all(usersAddedQueries)
			.then(messages => messages);
		return msg_users;
	}

	async changeUserRoleInOrganization(orgId: number, userId: number, role: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users/${userId}`;
		const userRole = { role };
		const message = await needle('patch', url, userRole, optionsBasicAuthApiAdmin)
			.then(res => (res.body.message))
			.catch(err => logger.log("error", "User role could not be changed: %s", err.message));
		return message;
	}

	async changeUsersRoleInOrganization(orgId: number, usersIdArray: number[], usersRoleArray: string[]): Promise<IMessage[]> {
		const usersCreationQueries = [];
		for (let i = 0; i < usersIdArray.length; i++) {
			const userId = usersIdArray[i];
			const userRole = { role: usersRoleArray[i] };
			const url = `${GrafanaApiURL}/orgs/${orgId}/users/${userId}`;
			usersCreationQueries[i] =
				needle('patch', url, userRole, optionsBasicAuthApiAdmin)
					.then(res => res.body)
					.catch(err => logger.log("error", "User role could not be changed: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages);
	}

	async removeUserFromOrganization(orgId: number, userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users/${userId}`;
		const message = await needle('delete', url, null, optionsBasicAuthApiAdmin)
			.then(res => (res.body.message))
			.catch(err => logger.log("error", "User could not be removed from organization: %s", err.message));
		return message;
	}

	async removeUsersFromOrganization(orgId: number, usersIdArray: number[]): Promise<IMessage[]> {
		const usersCreationQueries = [];
		for (let i = 0; i < usersIdArray.length; i++) {
			const url = `${GrafanaApiURL}/orgs/${orgId}/users/${usersIdArray[i]}`;
			usersCreationQueries[i] =
				needle('delete', url, null, optionsBasicAuthApiAdmin)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be removed from organization: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages)
	}

	async createUsers(users: CreateUserDto[]): Promise<IMessage[]> {
		const url = `${GrafanaApiURL}/admin/users`;
		const usersCreationQueries = [];
		for (let i = 0; i < users.length; i++) {
			if (i % 25 === 0) {
				await wait(1000);
			}
			usersCreationQueries[i] =
				needle('post', url, users[i], optionsBasicAuthApiAdmin)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be created: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages);
	}

	async deleteGlobalUser(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}`;
		const message = await needle('delete', url, null, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with id=${userId} could not be deleted: %s", err.message));
		return message;
	}

	async deleteOrgApiAdminUser(orgId: number): Promise<IMessage> {
		const userName = `org_${orgId}_api_amin`;
		const getUserIdUrl = `${GrafanaApiURL}/users/lookup?loginOrEmail=${userName}`;
		const user_message = await needle('get', getUserIdUrl, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with username=${userName} could not be deleted: %s", err.message));

		const url = `${GrafanaApiURL}/admin/users/${user_message.id as number}`;
		const message = await needle('delete', url, null, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with id=${user_message.id} could not be deleted: %s", err.message));
		return message;
	}

	async changeUserPassword(userId: number, newPassword: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/password`;
		const passwordData = { password: newPassword };
		const message = await needle('put', url, passwordData, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "The password to the user with id=${userId} could not be changed: %s", err.message));
		return message;
	}

	async logoutUser(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/logout`;
		const message = await needle('post', url, null, optionsBasicAuthApiAdmin)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with id=${userId} could not be logout: %s", err.message));
		return message;
	}

	async createTeam(orgId: number, teamData: ITeamDTO): Promise<IMessage> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams`;
		const message = await needle('post', url, teamData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "A new team could not be created: %s", err.message));
		return message;
	}

	async getTeamsWithPaging(orgId: number, perpage: number, page: number, query?: string, name?: string): Promise<TeamsWithPaging> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const base_url = `${GrafanaApiURL}/teams/search?`;
		let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
		url = query ? `${url}&query=${query}` : url;
		url = name ? `${url}&name=${name}` : url;
		const teams = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Teams with paging could not be geted: %s", err.message));
		return teams;
	}

	async getTeamById(orgId: number, teamId: number): Promise<ITeam> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be found: %s", err.message));
		return team;
	}

	async updateTeamById(orgId: number, teamId: number, teamData: ITeamDTO): Promise<IMessage> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('put', url, teamData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be updated: %s", err.message));
		return team;
	}

	async deleteTeamById(orgId: number, teamId: number): Promise<IMessage> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be deleted: %s", err.message));
		return team;
	}

	async getTeamMembers(orgId: number, teamId: number): Promise<TeamMember[]> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}/members`;
		const members = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Members fot team with id=${teamId} could not be geted: %s", err.message));
		return members;
	}

	async addTeamMembers(orgId: number, teamId: number, usersId: IUserId[]): Promise<string[]> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}/members`;
		const usersCreationQueries = [];
		for (let i = 0; i < usersId.length; i++) {
			usersCreationQueries[i] =
				needle('post', url, usersId[i], optionsBasicAuth)
					.then(res => {
						return res.body.message;
					})
					.catch(err => logger.log("error", "A member to the team with id=${teamId} could not be added: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages)
	}

	async addMemberToTeam(orgId: number, teamId: number, userId: IUserId): Promise<IMessage> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}/members`;
		const message = await needle('post', url, userId, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "A member to the team with id=${teamId} could not be added: %s", err.message));
		return message;
	}

	async removeMemberFromTeam(orgId: number, teamId: number, usersId: number): Promise<IMessage> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const url = `${GrafanaApiURL}/teams/${teamId}/members/${usersId}`;
		const message = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "The member with id=${usersId} could not be removed to the team with id=${teamId}: %s", err.message));
		return message;
	}

	async removeMembersFromTeam(orgId: number, teamId: number, userIdsArray: number[]): Promise<IMessage[]> {
		const optionsBasicAuth = optionsBasicAuthOrgAdmin(orgId);
		const memberToRemoveQueries = [];
		for (let i = 0; i < userIdsArray.length; i++) {
			const url = `${GrafanaApiURL}/teams/${teamId}/members/${userIdsArray[i]}`;
			memberToRemoveQueries[i] =
				needle('delete', url, null, optionsBasicAuth)
					.then(res => {
						return res.body;
					})
					.catch(err => logger.log("error", "A member to the team with id=${teamId} could not be removed: %s", err.message));
		}

		return await Promise.all(memberToRemoveQueries)
			.then(messages => messages)
	}

	async createFolder(folderData: IFolderDTO, orgKey: string): Promise<IFolder> {
		const url = `${GrafanaApiURL}/folders`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const folder = await needle('post', url, folderData, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "A new folder could not be created: %s", err.message));
		return folder;
	}

	async folderPermission(orgId: number, uid: string, folderPermissionDTO: IFolderPermissionDTO, orgKey: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/folders/${uid}/permissions`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const message = await needle('post', url, folderPermissionDTO, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "Permissions to folder with id=${teamId} could not be assigned: %s", err.message));
		return message;
	}

	async deleteFolderByUid(orgId: number, folderUid: string, orgKey: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/folders/${folderUid}`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const message = await needle('delete', url, null, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "Folder with uid={folderUid} could not be deleted: %s", err.message));
		return message;
	}

	private generateOptionsToken(orgKey: string): IOptionsToken {
		const optionsToken = {
			headers: { "Authorization": `Bearer ${orgKey}`, "Content-Type": "application/json", "Accept": "application/json" }
		}
		return optionsToken;
	}


	async createDataSourcePostgres(orgId: number, name: string, orgKey: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/datasources`;
		const optionsToken = this.generateOptionsToken(orgKey);

		const dataSource = {
			access: "proxy",
			basicAuth: false,
			basicAuthPassword: "",
			basicAuthUser: "",
			database: process_env.POSTGRES_DB,
			name,
			orgId,
			password: "",
			type: "postgres",
			url: "postgres:5432",
			user: "grafana_datasource_user",
			version: 1,
			withCredentials: false
		};

		const message = await needle('post', url, dataSource, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", `Data source for the organization with id: ${orgId} could not be created: %s`, err.message));
		return message;
	}

	async createNotificationChannel(orgKey: string, notifChannelData: INotificationChannel): Promise<INotificationChannel> {
		const url = `${GrafanaApiURL}/alert-notifications`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const notificationChannel: INotificationChannel = await needle('post', url, notifChannelData, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "A new notification channel could not be created: %s", err.message));
		await updateNotificationChannelSettings(notificationChannel.id, notifChannelData.settings);
		return notificationChannel;
	}

	async updateNotificationChannel(orgKey: string, notifChannelData: INotificationChannel): Promise<INotificationChannel> {
		const url = `${GrafanaApiURL}/alert-notifications/${notifChannelData.id}`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const notificationChannel: INotificationChannel = await needle('put', url, notifChannelData, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "The notification channel could not be updated: %s", err.message));
		await updateNotificationChannelSettings(notificationChannel.id, notifChannelData.settings);
		return notificationChannel;
	}

}

