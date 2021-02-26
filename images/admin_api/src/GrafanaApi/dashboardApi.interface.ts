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
