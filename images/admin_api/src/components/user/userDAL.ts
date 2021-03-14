import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import { logger } from "../../config/winston";
import { QueryResult } from 'pg';
import CreateUserDto from "./User.dto";
import IUser from "./User.interface";
import IUserLoginData from "./UserLoginData.inteface";
import IUserInOrg from "./UserInOrg.interface";
import IUserIdAndEmail from "./UserIdAndEmail.interface";
import IUserDTO from "../../GrafanaApi/interfaces/UserDTO";

export const getUserLoginDatadByEmailOrLogin = async (emailOrLogin: string): Promise<IUserLoginData> => {
	const response: QueryResult = await
		pool.query('SELECT id, login, email, password, salt FROM grafanadb.user WHERE email = $1 OR login = $1', [emailOrLogin]);
	return response.rows[0];
};

export const getUsersIdByEmailsArray = async (emailArray: string[]): Promise<(IUserIdAndEmail | null)[]> => {
	const response: QueryResult =
		await pool.query('SELECT id, email FROM grafanadb.user WHERE email =  ANY($1::varchar(190)[])', [emailArray]);
	return response.rows;
};

export const getUserByProp = async (propName: string, propValue: string | number): Promise<IUser> => {
	const response: QueryResult = await
		pool.query(`SELECT id, name, login, email, telegram_id as "telegramId", is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as lastSeenAt,
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user WHERE ${propName} = $1`, [propValue]);
	return response.rows[0];
};

export const getGlobalUsers = async (): Promise<IUser[]> => {
	const query = `SELECT id, name, login, email, telegram_id as "telegramId", is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as lastSeenAt, AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					ORDER BY id ASC`
	const result = await pool.query(query);
	return result.rows;
};

export const getUserdByEmailOrLogin = async (emailOrLogin: string): Promise<IUser> => {
	const response: QueryResult = await
		pool.query(`SELECT id, name, login, email, telegram_id as "telegramId", is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as "lastSeenAt",
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user WHERE email = $1 OR login = $1`, [emailOrLogin]);
	return response.rows[0];
};

export const createOrganizationUser = async (userData: CreateUserDto, orgId: number) => {
	const user_msg = await grafanaApi.createUser(userData);
	if (userData.telegramId) {
		await pool.query('UPDATE grafanadb.user SET telegram_id = $1 WHERE id = $2', [userData.telegramId, user_msg.id]);
	}
	if (orgId !== 1) {
		await grafanaApi.removeUserFromOrganization(orgId, user_msg.id);
		await grafanaApi.addUserToOrganization(orgId, userData.email, userData.roleInOrg);
	} else {
		await grafanaApi.changeUserRoleInOrganization(orgId, user_msg.id, userData.roleInOrg);
	}
	return user_msg;
}

export const createOrganizationUsers = async (usersData: CreateUserDto[], orgId: number) => {
	const msg_users = await grafanaApi.createUsers(usersData);
	const userWithTelegramId = usersData.filter(user => user.telegramId);
	const numCreatedUsers = msg_users.filter(msg => msg.message === "User created").length;

	if (numCreatedUsers) {
		const usersModificationQuery = [];
		for (let i = 0; i < userWithTelegramId.length; i++) {
			usersModificationQuery[i] = pool.query('UPDATE grafanadb.user SET telegram_id = $1 WHERE email = $2', [usersData[i].telegramId, userWithTelegramId[i].email]);
		}
		await Promise.all(usersModificationQuery);


		const usersIdArray = msg_users.filter(msg => msg.message === "User created").map(msg => msg.id);
		const usersRoleArray: string[] = [];
		msg_users.forEach((msg, index) => {
			if (msg.message === "User created") usersRoleArray.push(usersData[index].roleInOrg);
		});
		await grafanaApi.changeUsersRoleInOrganization(orgId, usersIdArray, usersRoleArray);
	}

	return numCreatedUsers;
}

export const createGlobalUser = async (userData: CreateUserDto) => {
	const user_msg = await createOrganizationUser(userData, 1);
	await grafanaApi.removeUserFromOrganization(1, user_msg.id);
	return user_msg;
}

export const isThisUserOrgAdmin = async (userId: number, orgId: number): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org_user WHERE user_id = $1 AND org_id = $2 AND role = $3',
		[userId, orgId, "Admin"]);
	return result.rows[0].count !== "0";
};

export const getOrganizationUsers = async (orgId: number): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", name, login, email, telegram_id as "telegramId", role as "roleInOrg",
					is_disabled as "isDisabled", last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1
					ORDER BY grafanadb.user.id ASC`
	const result = await pool.query(query, [orgId]);
	return result.rows;
};

export const getOrganizationUserByProp = async (orgId: number, propName: string, propValue: string | number): Promise<IUserInOrg> => {
	const query = `SELECT grafanadb.user.id as "userId", name, login, email, telegram_id as "telegramId", role as "roleInOrg",
					is_disabled as "isDisabled", last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.${propName} = $2`
	const result = await pool.query(query, [orgId, propValue]);
	return result.rows[0];
};

export const updateOrganizationUser = async (userData: IUserInOrg) => {
	const query = `UPDATE grafanadb.user
                	SET  name = $1, login = $2, email = $3, telegram_id = $4
		       		WHERE id = $5`;
	await pool.query(query, [userData.name, userData.login, userData.email, userData.telegramId, userData.userId]);
};


export const updateGlobalUser = async (userData: IUser) => {
	const query = `UPDATE grafanadb.user
                	SET  name = $1, login = $2, email = $3, telegram_id = $4, is_admin = $5
		       		WHERE id = $6`;
	await pool.query(query, [userData.name, userData.login, userData.email, userData.telegramId, userData.isGrafanaAdmin, userData.id]);
};