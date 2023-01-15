import IMessage from "./interfaces/Message";
import ITeamDTO from "./interfaces/TeamDTO";
import IFolderDTO from "./interfaces/FolderDTO";
import IFolder from "./interfaces/Folder";
import IFolderPermissionDTO from "./interfaces/FolderPermissionDTO";
import IUserId from "./interfaces/UserId";
import ITeamMember from "./interfaces/TeamMember";
import ITeamsWithPaging from "./interfaces/TeamsWithPaging";
import ITeam from "./interfaces/Team";
import IOrganizationGrafanaDTO from "./interfaces/IOrganizationGrafanaDTO";
import IOrganizationGrafana from "./interfaces/IOrganizationGrafana";
import IApiKey from "./interfaces/ApiKey";
import IApiKeyDTO from "./interfaces/ApiKeyDTO";
import IUserInOrgGrafana from "./interfaces/UserInOrgGrafana.interface";
import IUserGlobalGrafana from "./interfaces/UserGlobalGrafana.interface";
import IPlatformStatistics from "./interfaces/PlatformStatistics";
import INotificationChannel from "./interfaces/NotificationChannel";
import CreateUserDto from "../components/user/interfaces/User.dto";
import IDataSource from "../components/group/interfaces/DataSource.interface";

export default interface IDashboardApi {
	getPlatformStatistics(): Promise<IPlatformStatistics>;

	createOrganization(orgData: IOrganizationGrafanaDTO): Promise<IMessage>;
	getOrganizations(): Promise<IOrganizationGrafana[]>;
	getOrganizationById(orgId: number): Promise<IOrganizationGrafana>;
	getOrganizationByName(orgName: string): Promise<IOrganizationGrafana>;
	updateOrganizationById(orgId: number, newName: string): Promise<IMessage>;
	deleteOrganizationById(orgId: number): Promise<IMessage>;
	switchOrgContextForAdmin(newOrgId: number): Promise<IMessage>;
	createApiKeyToken(apiKeyData: IApiKeyDTO): Promise<IApiKey>;

	getUsers(): Promise<IUserGlobalGrafana[]>;
	getOrganizationUsers(orgId: number): Promise<IUserInOrgGrafana[]>;
	getUsersWithPaging(perpage: number, page: number, query: string): Promise<IUserGlobalGrafana[]>;
	getUserByLoginOrEmail(loginOrEmail: string): Promise<IUserGlobalGrafana>;
	giveGrafanaAdminPermissions(userId: number): Promise<IMessage>;
	addUserToOrganization(orgId: number, userEmail: string, roleInOrg: string): Promise<IMessage>;
	addUsersToOrganization(orgId: number, usersData: CreateUserDto[]): Promise<IMessage[]>;
	changeUserRoleInOrganization(orgId: number, userId: number, role: string): Promise<IMessage>
	changeUsersRoleInOrganization(orgId: number, usersIdArray: number[], usersRoleArray: string[]): Promise<IMessage[]>
	removeUserFromOrganization(orgId: number, usersIdArray: number): Promise<IMessage>;
	removeUsersFromOrganization(orgId: number, idArray: number[]): Promise<IMessage[]>
	createUser(user: CreateUserDto): Promise<IMessage>;
	createUsers(users: CreateUserDto[]): Promise<IMessage[]>;
	createOrgApiAdminUser(orgId: number): Promise<IMessage>;
	deleteGlobalUser(userId: number): Promise<IMessage>;
	deleteOrgApiAdminUser(orgId: number): Promise<IMessage>;
	changeUserPassword(userId: number, password: string): Promise<IMessage>;
	logoutUser(userId: number): Promise<IMessage>;

	createTeam(orgId: number, teamData: ITeamDTO): Promise<IMessage>;
	getTeamsWithPaging(orgId: number, perpage: number, page: number, query?: string, name?: string): Promise<ITeamsWithPaging>;
	getTeamById(orgId: number, teamId: number): Promise<ITeam>;
	updateTeamById(orgId: number, teamId: number, teamData: ITeamDTO): Promise<IMessage>;
	deleteTeamById(orgId: number, teamId: number): Promise<IMessage>;
	getTeamMembers(orgId: number, teamId: number): Promise<ITeamMember[]>;
	addTeamMembers(orgId: number, teamId: number, usersId: IUserId[]): Promise<string[]>;
	addMemberToTeam(orgId: number, teamId: number, userId: IUserId): Promise<IMessage>;
	removeMemberFromTeam(orgId: number, teamId: number, userId: number): Promise<IMessage>;
	removeMembersFromTeam(orgId: number, teamId: number, userIdsArray: number[]): Promise<IMessage[]>;

	createFolder(folderData: IFolderDTO, orgKey: string): Promise<IFolder>;
	folderPermission(
		orgId: number,
		uid: string,
		folderPermissionDTO: IFolderPermissionDTO,
		orgKey: string
	): Promise<IMessage>;
	deleteFolderByUid(orgId: number, folderUid: string, orgKey: string): Promise<IMessage>;

	createDataSourceTimescaledb(
		orgId: number,
		name: string,
		user: string,
		password: string,
		orgKey: string
	): Promise<IMessage>;

	updateDataSourceimescaledb(
		oldDataSource: IDataSource,
		newPassword: string,
		orgKey: string
	): Promise<IMessage>;

	getDataSourceByName(
		datasourceName: string,
		orgKey: string
	): Promise<IDataSource | IMessage>;

	createNotificationChannel(orgKey: string, notifChannelData: INotificationChannel): Promise<INotificationChannel>;
	updateNotificationChannel(orgKey: string, notifChannelData: INotificationChannel): Promise<INotificationChannel>;
}
