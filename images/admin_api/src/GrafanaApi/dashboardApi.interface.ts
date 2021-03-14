import IMessage from "./interfaces/Message";
import IUserDTO from "./interfaces/UserDTO";
import IUser from "../components/user/User.interface";
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
import IUsersAddedToOrg from "./interfaces/UsersAddedToOrg";
import IUsersCreated from "./interfaces/UsersCreated";
import IUserInOrgGrafana from "./interfaces/UserInOrgGrafana.interface";
import IUserGlobalGrafana from "./interfaces/UserGlobalGrafana.interface";
import IPlatformStatistics from "./interfaces/PlatformStatistics";



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
	addUserToOrganization(orgId: number, userEmail: string, roleInOrg: string): Promise<IMessage>
	addUsersToOrganization(orgId: number, usersData: IUserDTO[]): Promise<number>
	changeUserRoleInOrganization(orgId: number, userId: number, role: string): Promise<IMessage>
	changeUsersRoleInOrganization(orgId: number, usersIdArray: number[], usersRoleArray: string[]): Promise<IMessage[]>
	removeUserFromOrganization(orgId: number, usersIdArray: number): Promise<IMessage>;
	removeUsersFromOrganization(orgId: number, idArray: number[]): Promise<IMessage[]>
	createUser(user: IUserDTO): Promise<IMessage>;
	createUsers(users: IUserDTO[]): Promise<IMessage[]>
	deleteGlobalUser(userId: number): Promise<IMessage>;
	changeUserPassword(userId: number, password: string): Promise<IMessage>;
	logoutUser(userId: number): Promise<IMessage>;

	createTeam(teamData: ITeamDTO): Promise<IMessage>;
	getTeamsWithPaging(perpage: number, page: number, query?: string, name?: string): Promise<ITeamsWithPaging>;
	getTeamById(teamId: number): Promise<ITeam>;
	updateTeamById(teamId: number, teamData: ITeamDTO): Promise<IMessage>;
	deleteTeamById(teamId: number): Promise<IMessage>;
	getTeamMembers(teamId: number): Promise<ITeamMember[]>;
	addTeamMembers(teamId: number, usersId: IUserId[]): Promise<IMessage>;
	addMemberToTeam(teamId: number, userId: IUserId): Promise<IMessage>;
	removeMemberFromTeam(teamId: number, userId: number): Promise<IMessage>;

	createFolder(folderData: IFolderDTO, orgKey: string): Promise<IFolder>;
	folderPermission(uid: string, folderPermissionDTO: IFolderPermissionDTO, orgKey: string): Promise<IMessage>;
	deleteFolderByUid(folderUid: string, orgKey: string): Promise<IMessage>;

	createDataSourcePostgres(orgId: number, name: string, orgKey: string): Promise<IMessage>;
}
