import needle from "needle";
import IFolder from "./interfaces/Folder";
import IFolderDTO from "./interfaces/FolderDTO";
import IFolderPermissionDTO from "./interfaces/FolderPermissionDTO";
import IMessage from "./interfaces/Message";
import ITeam from "./interfaces/Team";
import ITeamDTO from "./interfaces/TeamDTO";
import TeamMember from "./interfaces/TeamMember";
import TeamsWithPaging from "./interfaces/TeamsWithPaging";
import IUser from "../components/user/User.interface";
import IUserDTO from "./interfaces/UserDTO";
import IUserId from "./interfaces/UserId";
import IDashboardApi from "./dashboardApi.interface";
import IOrganizationGrafana from "./interfaces/IOrganizationGrafana";
import IOrganizationGrafanaDTO from "./interfaces/IOrganizationGrafanaDTO";
import IApiKey from "./interfaces/ApiKey";
import IApiKeyDTO from "./interfaces/ApiKeyDTO";
import { logger } from "../config/winston";
import IUsersAddedToOrg from "./interfaces/UsersAddedToOrg";
import IUsersCreated from "./interfaces/UsersCreated";
import IUserInOrgGrafana from "./interfaces/UserInOrgGrafana.interface";
import IUserGlobalGrafana from "./interfaces/UserGlobalGrafana.interface";
import IPlatformStatistics from "./interfaces/PlatformStatistics";
import IOptionsToken from "./interfaces/OptionsToken";

const GrafanaApiURL = "grafana:5000/api"
const optionsBasicAuth = {
	username: process.env.PLATFORM_ADMIN_USER_NAME,
	password: process.env.PLATFORM_ADMIN_PASSWORD,
	json: true
}

export default class GrafanaApi implements IDashboardApi {
	async getPlatformStatistics(): Promise<IPlatformStatistics> {
		const url = `${GrafanaApiURL}/admin/stats`;
		const statistics = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Platform statistics could not be geted: %s", err.message));
		return statistics;
	}

	async createOrganization(orgData: IOrganizationGrafanaDTO): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs`;
		const message = await needle('post', url, orgData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization ${orgData.name} could not be created: %s", err.message));
		return message;
	}

	async getOrganizations(): Promise<IOrganizationGrafana[]> {
		const url = `${GrafanaApiURL}/orgs`;
		const organizations = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organizations could not be found: %s", err.message));
		return organizations;
	}

	async getOrganizationById(orgId: number): Promise<IOrganizationGrafana> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const organization = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be found: %s", err.message));
		return organization;
	}

	async getOrganizationByName(orgName: string): Promise<IOrganizationGrafana> {
		const url = `${GrafanaApiURL}/orgs/${orgName}`;
		const organization = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with name=${orgName} could not be found: %s", err.message));
		return organization;
	}

	async updateOrganizationById(orgId: number, newName: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const newOrgName = { name: newName };
		const message = await needle('put', url, newOrgName, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be updated: %s", err.message));
		return message;
	}

	async deleteOrganizationById(orgId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}`;
		const message = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Organization with id=${orgId} could not be deleted: %s", err.message));
		return message;
	}

	async switchOrgContextForAdmin(newOrgId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/user/using/${newOrgId}`;
		const message = await needle('post', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Context to org. id=${newOrgId} could not be switched: %s", err.message));
		return message;
	}

	async createApiKeyToken(apiKeyData: IApiKeyDTO): Promise<IApiKey> {
		const url = `${GrafanaApiURL}/auth/keys`;
		const apikey = await needle('post', url, apiKeyData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Api token could not be created: %s", err.message));
		return apikey;
	}

	async getUsers(): Promise<IUserGlobalGrafana[]> {
		const url = `${GrafanaApiURL}/users`;
		const users = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users could not get: %s", err.message));
		return users;
	}

	async getOrganizationUsers(orgId: number): Promise<IUserInOrgGrafana[]> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users`;
		const users = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users could not get: %s", err.message));
		return users;
	}

	async getUsersWithPaging(perpage: number, page: number, query: string): Promise<IUserGlobalGrafana[]> {
		const base_url = `${GrafanaApiURL}/users/search?`;
		let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
		url = query ? `${url}&query=${query}` : url;
		const users = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users with paging could not be geted: %s", err.message));
		return users;
	}

	async getUserByLoginOrEmail(loginOrEmail: string): Promise<IUserGlobalGrafana> {
		const url = `${GrafanaApiURL}/users/lookup?loginOrEmail=${loginOrEmail}`;
		const user = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Users with login or email=${loginOrEmail} could not be geted: %s", err.message));
		return user;
	}

	async createUser(user: IUserDTO, options_BasicAuth = optionsBasicAuth): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users`;
		const message = await needle('post', url, user, options_BasicAuth)
			.then(res => (res.body))
			.catch(err => logger.log("error", "User could not be created: %s", err.message));
		return message;
	}

	async giveGrafanaAdminPermissions(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/permissions`;
		const body = { isGrafanaAdmin: true };
		const grafanaAdminBasicAuthOptions = {
			username: 'admin',
			password: process.env.GRAFANA_ADMIN_PASSWORD,
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
		const user_message = await needle('post', url, userData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "User could not be added to the organization: %s", err.message));
		return user_message;
	}

	async addUsersToOrganization(orgId: number, usersData: IUserDTO[]): Promise<number> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users`;
		const usersAddedQueries = [];
		for (let i = 0; i < usersData.length; i++) {
			const userData = { loginOrEmail: usersData[i].email, role: usersData[i].roleInOrg };
			usersAddedQueries[i] =
				needle('post', url, userData, optionsBasicAuth)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be added to the organization: %s", err.message));

		}

		const msg_users = await Promise.all(usersAddedQueries)
			.then(messages => messages);

		return msg_users.filter(msg => msg.message === "User added to organization").length;
	}

	async changeUserRoleInOrganization(orgId: number, userId: number, role: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users/${userId}`;
		const userRole = { role };
		const message = await needle('patch', url, userRole, optionsBasicAuth)
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
				needle('patch', url, userRole, optionsBasicAuth)
					.then(res => res.body)
					.catch(err => logger.log("error", "User role could not be changed: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages);
	}

	async removeUserFromOrganization(orgId: number, userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/orgs/${orgId}/users/${userId}`;
		const message = await needle('delete', url, null, optionsBasicAuth)
			.then(res => (res.body.message))
			.catch(err => logger.log("error", "User could not be removed from organization: %s", err.message));
		return message;
	}

	async removeUsersFromOrganization(orgId: number, usersIdArray: number[]): Promise<IMessage[]> {
		const usersCreationQueries = [];
		for (let i = 0; i < usersIdArray.length; i++) {
			const url = `${GrafanaApiURL}/orgs/${orgId}/users/${usersIdArray[i]}`;
			usersCreationQueries[i] =
				needle('delete', url, null, optionsBasicAuth)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be removed from organization: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages)
	}

	async createUsers(users: IUserDTO[]): Promise<IMessage[]> {
		const url = `${GrafanaApiURL}/admin/users`;
		const usersCreationQueries = [];
		for (let i = 0; i < users.length; i++) {
			usersCreationQueries[i] =
				needle('post', url, users[i], optionsBasicAuth)
					.then(res => res.body)
					.catch(err => logger.log("error", "User could not be created: %s", err.message));
		}

		return await Promise.all(usersCreationQueries)
			.then(messages => messages);
	}

	async deleteGlobalUser(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}`;
		const message = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with id=${userId} could not be deleted: %s", err.message));
		return message;
	}

	async changeUserPassword(userId: number, newPassword: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/password`;
		const passwordData = { password: newPassword };
		const message = await needle('put', url, passwordData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "The password to the user with id=${userId} could not be changed: %s", err.message));
		return message;
	}

	async logoutUser(userId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/admin/users/${userId}/logout`;
		const message = await needle('post', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "The user with id=${userId} could not be logout: %s", err.message));
		return message;
	}

	async createTeam(teamData: ITeamDTO): Promise<IMessage> {
		const url = `${GrafanaApiURL}/teams`;
		const message = await needle('post', url, teamData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "A new team could not be created: %s", err.message));
		return message;
	}

	async getTeamsWithPaging(perpage: number, page: number, query?: string, name?: string): Promise<TeamsWithPaging> {
		const base_url = `${GrafanaApiURL}/teams/search?`;
		let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
		url = query ? `${url}&query=${query}` : url;
		url = name ? `${url}&name=${name}` : url;
		const teams = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Teams with paging could not be geted: %s", err.message));
		return teams;
	}

	async getTeamById(teamId: number): Promise<ITeam> {
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be found: %s", err.message));
		return team;
	}

	async updateTeamById(teamId: number, teamData: ITeamDTO): Promise<IMessage> {
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('put', url, teamData, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be updated: %s", err.message));
		return team;
	}

	async deleteTeamById(teamId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/teams/${teamId}`;
		const team = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Team with id=${teamId} could not be deleted: %s", err.message));
		return team;
	}

	async getTeamMembers(teamId: number): Promise<TeamMember[]> {
		const url = `${GrafanaApiURL}/teams/${teamId}/members`;
		const members = await needle('get', url, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "Members fot team with id=${teamId} could not be geted: %s", err.message));
		return members;
	}

	async addTeamMembers(teamId: number, usersId: IUserId[]): Promise<IMessage> {
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
			.then(messages => {
				let usersAdded = 0;
				messages.forEach(msg => {
					if (msg === "Member added to Team") usersAdded++
				})
				return { message: `Have been added ${usersAdded} users to team with id: ${teamId}` };
			})
	}

	async addMemberToTeam(teamId: number, userId: IUserId): Promise<IMessage> {
		const url = `${GrafanaApiURL}/teams/${teamId}/members`;
		const message = await needle('post', url, userId, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "A member to the team with id=${teamId} could not be added: %s", err.message));
		return message;
	}

	async removeMemberFromTeam(teamId: number, usersId: number): Promise<IMessage> {
		const url = `${GrafanaApiURL}/teams/${teamId}/members/${usersId}`;
		const message = await needle('delete', url, null, optionsBasicAuth)
			.then(res => res.body)
			.catch(err => logger.log("error", "The member with id=${usersId} could not be removed to the team with id=${teamId}: %s", err.message));
		return message;
	}

	async createFolder(folderData: IFolderDTO, orgKey: string): Promise<IFolder> {
		const url = `${GrafanaApiURL}/folders`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const folder = await needle('post', url, folderData, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "A new folder could not be created: %s", err.message));
		return folder;
	}

	async folderPermission(uid: string, folderPermissionDTO: IFolderPermissionDTO, orgKey: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/folders/${uid}/permissions`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const message = await needle('post', url, folderPermissionDTO, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "Permissions to folder with id=${teamId} could not be assigned: %s", err.message));
		return message;
	}

	async deleteFolderByUid(folderUid: string, orgKey: string): Promise<IMessage> {
		const url = `${GrafanaApiURL}/folders/${folderUid}`;
		const optionsToken = this.generateOptionsToken(orgKey);
		const message = await needle('delete', url, null, optionsToken)
			.then(res => res.body)
			.catch(err => logger.log("error", "Folder with uid={folderUid} could not be deleted: %s", err.message));
		return message;
	}

	private generateOptionsToken(orgKey: string): IOptionsToken {
		const optionsToken = {
			headers: { "Authorization": `Bearer ${orgKey}` }
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
			database: process.env.POSTGRES_DB,
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

}

