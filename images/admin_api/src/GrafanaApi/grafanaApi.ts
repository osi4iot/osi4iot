import needle from "needle";
import { v4 as uuidv4 } from "uuid";
import IFolder from "../entities/Folder";
import IFolderDTO from "../entities/FolderDTO";
import IFolderPermissionDTO from "../entities/FolderPermissionDTO";
import IMessage from "../entities/Message";
import ITeam from "../entities/Team";
import ITeamDTO from "../entities/TeamDTO";
import TeamMember from "../entities/TeamMember";
import TeamsWithPaging from "../entities/TeamsWithPaging";
import IUser from "../entities/User";
import IUserDTO from "../entities/UserDTO";
import IUserId from "../entities/UserId";
import IDashboardApi from "./dashboardApi.interface";

const GrafanaApiURL = "http://localhost:5000/api"
const optionsBasicAuth = {
    username: 'admin',
    password: process.env.GRAFANA_ADMIN_PASSWORD,
    json: true
}
const optionsToken = {
    headers: { "Authorization": "Bearer eyJrIjoiN2dPWnhQY0hiank5MU02MlJ2b1lhdmhBTzFTQ0FCYnciLCJuIjoiSU9UX0VFQkVfS2V5IiwiaWQiOjF9"}
}

export default class GrafanaApi implements IDashboardApi {
    async getUsers(): Promise<IUser[]> {
        const url = `${GrafanaApiURL}/users`;
        const users  = await needle('get', url, optionsBasicAuth)
            .then( res => res.body)
            .catch( err => console.log(err));
        return users;
    }

    async getUsersWithPaging(perpage: number, page: number, query: string): Promise<IUser[]> {
        const base_url = `${GrafanaApiURL}/users/search?`;
        let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
        url = query ? `${url}&query=${query}` : url;
        const users  = await needle('get', url, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return users;
    }

    async getUserByLoginOrEmail(loginOrEmail: string): Promise<IUser> {
        throw new Error("Method not implemented.");
    }

    async createUsers(users: IUserDTO[]): Promise<IMessage> {
        const url = `${GrafanaApiURL}/admin/users`;
        const usersCreationQueries = [];
        for (let i = 0; i < users.length; i++) {
            usersCreationQueries[i] =
                needle('post', url, users[i], optionsBasicAuth)
                .then(res => (res.body.message as string))
                .catch( err => console.log(err));
        }

        return await Promise.all(usersCreationQueries)
            .then(messages => {
                let userCreated = 0;
                messages.forEach(msg => { if (msg === "User created") userCreated++ } )
                return { message: `Have been created ${userCreated} users` };
            })
    }

    async deleteUser(userId: number): Promise<IMessage> {
        throw new Error("Method not implemented.");
    }

    async changeUserPassword(userId: number, password: string): Promise<IMessage> {
        throw new Error("Method not implemented.");
    }

    async createTeam(teamData: ITeamDTO): Promise<IMessage> {
        const url = `${GrafanaApiURL}/teams`;
        const message  = await needle('post', url, teamData, optionsToken)
            .then( res => res.body)
            .catch( err => console.log(err));
        return message;
    }

    async getTeamsWithPaging(perpage: number, page: number, query?: string,  name?: string): Promise<TeamsWithPaging> {
        const base_url = `${GrafanaApiURL}/teams/search?`;
        let url = (perpage && page) ? `${base_url}perpage=${perpage}&page=${page}` : base_url;
        url = query ? `${url}&query=${query}` : url;
        url = name ? `${url}&name=${name}` : url;
        const teams  = await needle('get', url, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return teams;
    }

    async getTeamById(teamId: number): Promise<ITeam> {
        const url = `${GrafanaApiURL}/teams/${teamId}`;
        const team  = await needle('get', url, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return team;
    }

    async updateTeamById(teamId: number, teamData: ITeamDTO): Promise<IMessage> {
        const url = `${GrafanaApiURL}/teams/${teamId}`;
        const team  = await needle('put', url, teamData, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return team;
    }

    async deleteTeamById(teamId: number): Promise<IMessage> {
        const url = `${GrafanaApiURL}/teams/${teamId}`;
        const team  = await needle('delete', url, null, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return team;
    }

    async getTeamMembers(teamId: number): Promise<TeamMember[]> {
        const url = `${GrafanaApiURL}/teams/${teamId}/members`;
        const members  = await needle('get', url, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
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
                .catch( err => console.log(err));
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
        const message  = await needle('post', url, userId, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return message;
    }

    async removeMemberFromTeam(teamId: number, usersId: number): Promise<IMessage> {
        const url = `${GrafanaApiURL}/teams/${teamId}/members/${usersId}`;
        const message  = await needle('delete', url, null, optionsBasicAuth)
            .then(res => res.body)
            .catch(err => console.log(err));
        return message;
    }

    async createFolder(data: IFolderDTO): Promise<IFolder> {
        const url = `${GrafanaApiURL}/folders`;
        const folderData = {
            uid: uuidv4(),
            title: data.title
        }
        const folder  = await needle('post', url, folderData, optionsToken)
            .then( res => res.body)
            .catch(err => console.log(err));
        return folder;
    }

    async folderPermission(uid: string, folderPermissionDTO: IFolderPermissionDTO): Promise<IMessage> {
        const url = `${GrafanaApiURL}/folders/${uid}/permissions`;
        const message  = await needle('post', url, folderPermissionDTO, optionsToken)
            .then( res => res.body)
            .catch(err => console.log(err));
        return message;
    }

}
