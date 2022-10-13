import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import { QueryResult } from 'pg';
import CreateUserDto from "./interfaces/User.dto";
import IUser from "./interfaces/User.interface";
import IUserLoginData from "./interfaces/UserLoginData.inteface";
import IUserInOrg from "./interfaces/UserInOrg.interface";
import UserRegisterDto from "../Authentication/userRegister.dto";
import { sendUserRegistrationInvitationEmail } from "./userEmailFactory";
import { passwordGenerator } from "../../utils/passwordGenerator";
import UserProfileDto from "./interfaces/UserProfile.dto";
import CreateGlobalUserDto from "./interfaces/GlobalUser.dto";
import normalizeString from '../../utils/helpers/normalizeString';

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
		pool.query(`SELECT id, name, login, email, is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as lastSeenAt,
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user WHERE ${propName} = $1`, [propValue]);
	return response.rows[0];
};

export const getGlobalUsers = async (): Promise<IUser[]> => {
	const query = `SELECT id, first_name as "firstName", surname, login, email,
					is_admin as "isGrafanaAdmin", is_disabled as "isDisabled", last_seen_at as lastSeenAt,
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user WHERE login != $1
					ORDER BY id ASC`
	const result = await pool.query(query, ["dev2pdb"]);
	return result.rows;
};

export const getUserdByEmailOrLogin = async (emailOrLogin: string): Promise<IUser> => {
	const response: QueryResult = await
		pool.query(`SELECT id, first_name as "firstName", surname, login, email,
					is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as "lastSeenAt",
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user WHERE email = $1 OR login = $1`, [emailOrLogin]);
	return response.rows[0];
};

export const createOrganizationUsers = async (orgId: number, usersData: CreateUserDto[]) => {
	usersData.forEach(user => {
		if (!user.name || user.name === "") user.name = `${user.firstName} ${user.surname}`
		if (!user.OrgId) user.OrgId = orgId;
		if (!user.login || user.login === "") {
			const username = `${user.firstName.replace(/ /g, ".").toLocaleLowerCase()}.${user.surname.replace(/ /g, ".").toLocaleLowerCase()}`;
			user.login = normalizeString(username);
		}
		if (!user.password || user.password === "") {
			const password = passwordGenerator(10);
			user.password = normalizeString(password);
		}
	});
	const msg_users = await grafanaApi.createUsers(usersData);
	const numCreatedUsers = msg_users.filter(msg => msg.message === "User created").length;

	if (numCreatedUsers) {
		const usersModificationQuery = [];
		for (let i = 0; i < usersData.length; i++) {
			usersModificationQuery[i] =
				pool.query('UPDATE grafanadb.user SET first_name = $1, surname = $2 WHERE email = $3',
					[usersData[i].firstName, usersData[i].surname, usersData[i].email]);
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

export const createFictitiousUserForService = async (serviceUserData: CreateUserDto) => {
	if (!(serviceUserData.password || serviceUserData.password === "")) {
		const password = passwordGenerator(10);
		serviceUserData.password = normalizeString(password);
	}
	const user_msg = await grafanaApi.createUsers([serviceUserData]);
	await grafanaApi.removeUserFromOrganization(1, user_msg[0].id);
	return user_msg[0];
}

export const createGlobalUsers = async (usersData: CreateUserDto[]) => {
	const users_msg = await createOrganizationUsers(1, usersData);
	const userIdArray = users_msg.map(msg => msg.id);
	await grafanaApi.removeUsersFromOrganization(1, userIdArray);
	await sendUserRegistrationInvitationEmail(usersData);
	return users_msg;
}

export const isThisUserOrgAdmin = async (userId: number, orgId: number): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org_user WHERE user_id = $1 AND org_id = $2 AND role = $3',
		[userId, orgId, "Admin"]);
	return result.rows[0].count !== 0;
};

export const isThisUserAdminOfSomeOrg = async (userId: number): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org_user WHERE user_id = $1 AND role = $2',
		[userId, "Admin"]);
	return result.rows[0].count !== 0;
};


export const getOrganizationUsers = async (orgId: number): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
					grafanadb.org_user.org_id as "orgId", role as "roleInOrg",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND login != $2
					ORDER BY grafanadb.user.id ASC`
	const result = await pool.query(query, [orgId, "dev2pdb"]);
	return result.rows;
};

export const getOrganizationUsersForOrgIdsArray = async (orgIdsArray: number[]): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
					grafanadb.org_user.org_id as "orgId", role as "roleInOrg",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = ANY($1::bigint[]) AND login != $2
					ORDER BY grafanadb.user.id ASC, grafanadb.org_user.org_id ASC`
	const result = await pool.query(query, [orgIdsArray, "dev2pdb"]);
	return result.rows;
};

export const getOrganizationUsersWithGrafanaAdmin = async (orgId: number): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname,  login, email,
					grafanadb.org_user.org_id as "orgId", role as "roleInOrg", is_admin as "isGrafanaAdmin",
					is_disabled as "isDisabled", last_seen_at as "lastSeenAt",
					AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1
					ORDER BY grafanadb.user.id ASC`
	const result = await pool.query(query, [orgId]);
	return result.rows;
};

export const getOrganizationUserWithGrafanaAdminByProp = async (orgId: number, propName: string, propValue: string | number): Promise<IUserInOrg> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login,  email,
					grafanadb.org_user.org_id as "orgId", role as "roleInOrg",  is_admin as "isGrafanaAdmin",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.${propName} = $2`
	const result = await pool.query(query, [orgId, propValue]);
	return result.rows[0];
};

export const getOrganizationUserByProp = async (orgId: number, propName: string, propValue: string | number): Promise<IUserInOrg> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login,  email,
					grafanadb.org_user.org_id as "orgId", role as "roleInOrg",
					grafanadb.user.is_admin as "isGrafanaAdmin",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.${propName} = $2  AND login != $3`
	const result = await pool.query(query, [orgId, propValue, "dev2pdb"]);
	return result.rows[0];
};

export const getOrganizationUsersByEmailArray = async (orgId: number, emailsArray: string[]): Promise<IUserInOrg[]> => {
	const query = `SELECT grafanadb.user.id as "userId", first_name AS "firstName", surname, login, email,
	                grafanadb.org_user.org_id as "orgId", role as "roleInOrg", is_disabled as "isDisabled",
					last_seen_at as "lastSeenAt", AGE(NOW(),last_seen_at) as "lastSeenAtAge"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.user.email =  ANY($2::varchar(190)[]) AND login != $3`
	const result = await pool.query(query, [orgId, emailsArray, "dev2pdb"]);
	return result.rows;
};


export const updateOrganizationUser = async (userData: IUserInOrg | UserRegisterDto) => {
	const name = `${userData.firstName} ${userData.surname}`
	const query = `UPDATE grafanadb.user
                	SET  name = $1, first_name = $2, surname = $3,  login = $4, email = $5
		       		WHERE id = $6`;
	await pool.query(query,
		[
			name,
			userData.firstName,
			userData.surname,
			userData.login,
			userData.email,
			userData.userId
		]);
};


export const updateGlobalUser = async (userData: IUser) => {
	const name = `${userData.firstName} ${userData.surname}`
	const query = `UPDATE grafanadb.user
                	SET  name = $1, first_name = $2, surname = $3, login = $4, email = $5, is_admin = $6
		       		WHERE id = $7`;
	await pool.query(query,
		[
			name,
			userData.firstName,
			userData.surname,
			userData.login,
			userData.email,
			userData.isGrafanaAdmin,
			userData.id
		]);
};

export const updateUserProfileById = async (userData: CreateUserDto) => {
	const name = `${userData.firstName} ${userData.surname}`
	const query = `UPDATE grafanadb.user
                	SET  name = $1, first_name = $2, surname = $3, login = $4, email = $5
		       		WHERE id = $6`;
	await pool.query(query,
		[
			name,
			userData.firstName,
			userData.surname,
			userData.login,
			userData.email,
			userData.id
		]);
};

export const isUsersDataCorrect = async (usersInputData: (CreateUserDto | CreateGlobalUserDto)[]): Promise<boolean> => {
	usersInputData.forEach(user => user.name = `${user.firstName} ${user.surname}`);
	const namesArray = usersInputData.map(user => user.name);
	const emailsArray = usersInputData.map(user => user.email);
	const loginArray = usersInputData.map(user => user.login).filter(item => !!item);
	if ((loginArray.length !== 0) && (namesArray.length !== loginArray.length)) {
		throw new Error('Each user must have the same amount of data');
	}
	const forbiddenUserNames = loginArray.filter(username => username.slice(-9) === "api_admin")
	if (forbiddenUserNames.length !== 0) {
		throw new Error('Usernames ending with "api_admin" are forbidden');
	}

	const response: QueryResult =
		await pool.query(`SELECT id, name, login, email FROM grafanadb.user
						WHERE name =  ANY($1::varchar(225)[])
						OR login =  ANY($2::varchar(190)[])
						OR email =  ANY($3::varchar(190)[])`,
			[namesArray, loginArray, emailsArray]);
	const existentUsers = response.rows;

	if (existentUsers.length > usersInputData.length) return false;
	for (const user of existentUsers) {
		const sameName = namesArray.indexOf(user.name) !== -1;
		const sameEmail = emailsArray.indexOf(user.email) !== -1;
		if (loginArray.length !== 0) {
			const sameLogin = loginArray.indexOf(user.login) !== -1;
			if ((sameName && sameEmail && sameLogin) !== (sameName || sameEmail || sameLogin)) return false;
		} else {
			if ((sameName && sameEmail) !== (sameName || sameEmail)) return false;
		}
	}

	return true;
};

export const isUserProfileDataCorrect = async (userProfileData: UserProfileDto): Promise<boolean> => {
	userProfileData.name = `${userProfileData.firstName} ${userProfileData.surname}`
	const response: QueryResult =
		await pool.query(`SELECT id, name, login, email FROM grafanadb.user
						WHERE name = $1
						OR login =  $2
						OR email =  $3`,
			[userProfileData.name, userProfileData.login, userProfileData.email]);
	const existentUsers = response.rows;

	if (existentUsers.length > 1) return false;
	else {
		if (existentUsers[0].id !== userProfileData.userId) return false;
	}

	return true;
};

