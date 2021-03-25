import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import { QueryResult } from 'pg';
import CreateUserDto from "./interfaces/User.dto";
import IUser from "./interfaces/User.interface";
import IUserLoginData from "./interfaces/UserLoginData.inteface";
import IUserInOrg from "./interfaces/UserInOrg.interface";
import UserRegisterDto from "../authentication/userRegister.dto";
import { sendUserRegistrationInvitationEmail } from "./userEmailFactory";
import { passwordGenerator } from "../../utils/passwordGenerator";


export const getUserLoginDatadByEmailOrLogin = async (emailOrLogin: string): Promise<IUserLoginData> => {
	const response: QueryResult = await
		pool.query('SELECT id, login, email, password, salt FROM grafanadb.user WHERE email = $1 OR login = $1', [emailOrLogin]);
	return response.rows[0];
};

export const getUsersIdByEmailsArray = async (emailArray: string[]): Promise<(Partial<IUser> | null)[]> => {
	const response: QueryResult =
		await pool.query('SELECT id, name, login, email FROM grafanadb.user WHERE email =  ANY($1::varchar(190)[])', [emailArray]);
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
	const query = `SELECT id, first_name as "firstName", surname, login, email, telegram_id as "telegramId",
					is_admin as "isGrafanaAdmin", is_disabled as "isDisabled", last_seen_at as lastSeenAt,
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
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

export const createOrganizationUsers = async (orgId: number, usersData: CreateUserDto[]) => {
	usersData.forEach(user => {
		if (!user.name || user.name === "") user.name = `${user.firstName}  ${user.surname}`
		if (!user.telegramId) user.telegramId = user.name;
		if (!user.OrgId) user.OrgId = orgId;
		if (!user.login) user.login = `${user.firstName.replace(/ /g, "_").toLocaleLowerCase()}.${user.surname.replace(/ /g, "_").toLocaleLowerCase()}`;
		if (!user.password) user.password = passwordGenerator(10);
	});
	const msg_users = await grafanaApi.createUsers(usersData);
	const numCreatedUsers = msg_users.filter(msg => msg.message === "User created").length;

	if (numCreatedUsers) {
		const usersModificationQuery = [];
		for (let i = 0; i < usersData.length; i++) {
			usersModificationQuery[i] =
				pool.query('UPDATE grafanadb.user SET first_name = $1, surname = $2, telegram_id = $3 WHERE email = $4',
					[usersData[i].firstName, usersData[i].surname, usersData[i].telegramId, usersData[i].email]);
		}
		await Promise.all(usersModificationQuery);


		const usersIdArray = msg_users.filter(msg => msg.message === "User created").map(msg => msg.id);
		const usersRoleArray: string[] = [];
		const usersCreatedArray: CreateUserDto[] = [];
		msg_users.forEach((msg, index) => {
			if (msg.message === "User created") {
				usersRoleArray.push(usersData[index].roleInOrg);
				usersCreatedArray.push(usersData[index]);
			}
		});
		await grafanaApi.changeUsersRoleInOrganization(orgId, usersIdArray, usersRoleArray);
		await sendUserRegistrationInvitationEmail(usersCreatedArray);
	}

	return msg_users;
}

export const createGlobalUser = async (userData: CreateUserDto) => {
	const user_msg = await createOrganizationUsers(1, [userData]);
	await grafanaApi.removeUserFromOrganization(1, user_msg[0].id);
	await sendUserRegistrationInvitationEmail([userData]);
	return user_msg[0];
}

export const isThisUserOrgAdmin = async (userId: number, orgId: number): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org_user WHERE user_id = $1 AND org_id = $2 AND role = $3',
		[userId, orgId, "Admin"]);
	return result.rows[0].count !== "0";
};

export const getOrganizationUsers = async (orgId: number): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
					telegram_id as "telegramId", role as "roleInOrg", is_disabled as "isDisabled",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1
					ORDER BY grafanadb.user.id ASC`
	const result = await pool.query(query, [orgId]);
	return result.rows;
};

export const getOrganizationUserByProp = async (orgId: number, propName: string, propValue: string | number): Promise<IUserInOrg> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
					telegram_id as "telegramId", role as "roleInOrg", is_disabled as "isDisabled",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.${propName} = $2`
	const result = await pool.query(query, [orgId, propValue]);
	return result.rows[0];
};

export const getOrganizationUsersByEmailArray = async (orgId: number, emailsArray: string[]): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
					telegram_id as "telegramId", role as "roleInOrg", is_disabled as "isDisabled",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.email =  ANY($2::varchar(190)[])`
	const result = await pool.query(query, [orgId, emailsArray]);
	return result.rows;
};


export const updateOrganizationUser = async (userData: IUserInOrg | UserRegisterDto) => {
	const name = `${userData.firstName} ${userData.surname}`
	const query = `UPDATE grafanadb.user
                	SET  name = $1, first_name = $2, surname = $3,  login = $4, email = $5, telegram_id = $6
		       		WHERE id = $7`;
	await pool.query(query,
		[
			name,
			userData.firstName,
			userData.surname,
			userData.login,
			userData.email,
			userData.telegramId,
			userData.userId
		]);
};


export const updateGlobalUser = async (userData: IUser) => {
	const name = `${userData.firstName} ${userData.surname}`
	const query = `UPDATE grafanadb.user
                	SET  name = $1, first_name = $2, surname = $3, login = $4, email = $5, telegram_id = $6, is_admin = $7
		       		WHERE id = $8`;
	await pool.query(query,
		[
			name,
			userData.firstName,
			userData.surname,
			userData.login,
			userData.email,
			userData.telegramId,
			userData.isGrafanaAdmin,
			userData.id
		]);
};

export const isUsersDataCorrect = async (usersInputData: CreateUserDto[]): Promise<boolean> => {
	usersInputData.forEach(user => user.name = `${user.firstName} ${user.surname}`);
	const namesArray = usersInputData.map(user => user.name);
	const loginArray = usersInputData.map(user => user.login);
	const emailsArray = usersInputData.map(user => user.email);
	const telegramIdArray = usersInputData.map(user => user.telegramId);
	const response: QueryResult =
		await pool.query(`SELECT id, name, login, email, telegram_id FROM grafanadb.user
						WHERE name =  ANY($1::varchar(225)[])
						OR login =  ANY($2::varchar(190)[])
						OR email =  ANY($3::varchar(190)[])
						OR telegram_id = ANY($3::varchar(200)[])`,
			[namesArray, loginArray, emailsArray]);
	const existentUsers = response.rows;

	if (existentUsers.length > usersInputData.length) return false;
	for (const user of existentUsers) {
		const sameName = namesArray.indexOf(user.name) !== -1;
		const sameLogin = loginArray.indexOf(user.login) !== -1;
		const sameEmail = emailsArray.indexOf(user.email) !== -1;
		const sameTelegramId = telegramIdArray.indexOf(user.telegram_id) !== -1;
		if ((sameName && sameLogin && sameEmail && sameTelegramId) !== (sameName || sameLogin || sameEmail || sameTelegramId)) return false;
	}

	return true;
}