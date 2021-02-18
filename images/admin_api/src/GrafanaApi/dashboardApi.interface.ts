import IMessage from "../entities/Message";
import IUserDTO from "../entities/UserDTO";
import IUser from "../entities/User";
import ITeamDTO from "../entities/TeamDTO";
import IFolderDTO from "../entities/FolderDTO";
import IFolder from "../entities/Folder";
import IFolderPermissionDTO from "../entities/FolderPermissionDTO";
import IUserId from "../entities/UserId";
import ITeamMember from "../entities/TeamMember";
import ITeamsWithPaging from "../entities/TeamsWithPaging";
import ITeam from "../entities/Team";

export default interface IDashboardApi {
    getUsers(): Promise<IUser[]>;
    getUsersWithPaging(perpage: number, page: number, query: string): Promise<IUser[]>;
    getUserByLoginOrEmail(loginOrEmail: string): Promise<IUser>;
    createUsers(users: IUserDTO[]): Promise<IMessage>;
    deleteUser(userId: number): Promise<IMessage>;
    changeUserPassword(userId: number, password: string): Promise<IMessage>;

    createTeam(teamData: ITeamDTO): Promise<IMessage>;
    getTeamsWithPaging(perpage: number, page: number, query?: string, name?: string): Promise<ITeamsWithPaging>;
    getTeamById(teamId: number): Promise<ITeam>;
    updateTeamById(teamId: number, teamData: ITeamDTO): Promise<IMessage>;
    deleteTeamById(teamId: number): Promise<IMessage>;
    getTeamMembers(teamId: number): Promise<ITeamMember[]>;
    addTeamMembers(teamId: number, usersId: IUserId[]): Promise<IMessage>;
    addMemberToTeam(teamId: number, userId: IUserId): Promise<IMessage>;
    removeMemberFromTeam(teamId: number, userId: number): Promise<IMessage>;

    createFolder(folderData: IFolderDTO): Promise<IFolder>;
    folderPermission(uid: string, folderPermissionDTO: IFolderPermissionDTO): Promise<IMessage>;
}
