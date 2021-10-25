import pool from "../../config/dbconfig";
import CreateOrganizationDto from "./interfaces/organization.dto";
import IOrganization, { IOrganizationWichTheLoggedUserIsUser } from "./interfaces/organization.interface";
import grafanaApi from "../../GrafanaApi";
import { decrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import CreateUserDto from "../user/interfaces/User.dto";
import { createOrganizationUsers, getUsersIdByEmailsArray } from "../user/userDAL";
import IUser from "../user/interfaces/User.interface";
import { addMembersToGroup, getDefaultOrgGroup, udpateRoleMemberInGroup } from "../group/groupDAL";
import CreateGroupMemberDto from "../group/interfaces/groupMember.dto";
import { RoleInGroupOption } from "../group/interfaces/RoleInGroupOptions";
import IMessage from "../../GrafanaApi/interfaces/Message";
import IUserInOrg from "../user/interfaces/UserInOrg.interface";
import IGroupMember from "../group/interfaces/GroupMember.interface";
import process_env from "../../config/api_config";

export const exitsOrganizationWithName = async (orgName: string): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org WHERE name = $1',
		[orgName]);
	return result.rows[0].count !== 0;
};

export const exitsOrganizationWithAcronym = async (orgAcronym: string): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org WHERE acronym = $1',
		[orgAcronym]);
	return result.rows[0].count !== 0;
};


export const updateOrganizationByProp = async (propName: string, propValue: (string | number), orgData: Partial<CreateOrganizationDto>): Promise<void> => {
	const query = `UPDATE grafanadb.org SET name = $1, acronym = $2, address1 = $3,  city = $4, zip_code = $5, state = $6, country = $7,
	building_id = $8  WHERE ${propName} = $9;`;
	const queryArray =
		[
			orgData.name,
			orgData.acronym,
			orgData.address,
			orgData.city,
			orgData.zipCode,
			orgData.state,
			orgData.country,
			orgData.buildingId,
			propValue
		];
	await pool.query(query, queryArray);
}

export const getApiKeyIdByName = async (apiKeyName: string): Promise<number> => {
	const result = await pool.query(`SELECT id FROM grafanadb.api_key WHERE name = $1`,
		[apiKeyName]);
	return result.rows[0].id;
}

export const insertOrganizationToken = async (orgId: number, apiKeyId: number, hashedApiKey: string): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.org_token (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`,
		[orgId, apiKeyId, hashedApiKey]);
};

export const getOrganizations = async (): Promise<IOrganization[]> => {
	const query = `SELECT id, org.name, acronym, address1 as address, city, grafanadb.org.zip_code as "zipCode",
					state, country, building_id AS "buildingId"
					FROM grafanadb.org
					ORDER BY id ASC;`;
	const result = await pool.query(query);
	return result.rows;
}

export const getOrganizationsWithIdsArray = async (orgIdsArray: number[]): Promise<IOrganization[]> => {
	const query = `SELECT id, org.name, acronym, address1 as address, city, grafanadb.org.zip_code as "zipCode",
					state, country, building_id AS "buildingId"
					FROM grafanadb.org
					WHERE id = ANY($1::integer[])
					ORDER BY id ASC;`;
	const result = await pool.query(query, [orgIdsArray]);
	return result.rows;
}

export const getNumOrganizations = async (): Promise<number> => {
	const query = `SELECT COUNT(*) FROM grafanadb.org;`;
	const result = await pool.query(query);
	return parseInt(result.rows[0].count, 10);
}

export const getOrganizationByProp = async (propName: string, propValue: (string | number)): Promise<IOrganization> => {
	const query = `SELECT id, org.name, acronym, address1 as adress, city, grafanadb.org.zip_code as "zipCode",
					 state, country, building_id AS "buildingId"
					FROM grafanadb.org WHERE ${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0];
}

export const getOrganizationKey = async (orgId: number): Promise<string> => {
	const query = `SELECT organization_key as "orgKey"
					FROM grafanadb.org_token WHERE org_id = $1;`;
	const result = await pool.query(query, [orgId]);
	const apiKey = decrypt(result.rows[0].orgKey);
	return apiKey;
}

export const createDefaultOrgDataSource = async (orgId: number, name: string, orgKey: string): Promise<void> => {
	const query1 = `SELECT id, json_data, secure_json_data
					FROM grafanadb.data_source WHERE name = $1;`;
	const dataSourceName = `iot_${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").replace(/"/g,"").toLowerCase()}_db`;
	const result = await pool.query(query1, [dataSourceName]);
	if (result.rows.length === 0) throw new Error("Main organization default data source not found");
	const jsonData = result.rows[0].json_data;
	const secureJsonData = result.rows[0].secure_json_data;
	const message = await grafanaApi.createDataSourcePostgres(orgId, name, orgKey);
	if ((message as any).message !== "Datasource added") throw new Error("Problem creating new data source");
	const dataSourceId = (message as any).id;

	const querry2 = 'UPDATE grafanadb.data_source SET is_default = $1, read_only= $2, json_data = $3, secure_json_data = $4 WHERE id = $5';
	await pool.query(querry2, [true, true, jsonData, secureJsonData, dataSourceId]);
}

export const addUsersToOrganizationAndMembersToDefaultOrgGroup = async (orgId: number, orgUsersArray: CreateUserDto[]): Promise<IMessage[]> => {
	const msg_users = await grafanaApi.addUsersToOrganization(orgId, orgUsersArray);
	const usersAddedToOrg: CreateUserDto[] = [];
	msg_users.forEach((msg, index) => {
		const orgUser = orgUsersArray[index];
		if (msg.message === "User added to organization") usersAddedToOrg.push(orgUser);
	});
	await addOrgUsersToDefaultOrgGroup(orgId, usersAddedToOrg);
	return msg_users;
}

export const addAdminToOrganization = async (orgId: number, orgAdminArray: CreateUserDto[]): Promise<number[]> => {
	orgAdminArray.forEach(user => user.roleInOrg = "Admin");
	const adminIdArray: number[] = [];
	orgAdminArray.forEach(user => adminIdArray.push(0));
	const usersIdArray = await getUsersIdByEmailsArray(orgAdminArray.map(user => user.email));
	const emailsArray = usersIdArray.map(user => user.email);
	const existingUserArray = orgAdminArray.filter(user => emailsArray.indexOf(user.email) !== -1);
	const nonExistingUserArray = orgAdminArray.filter(user => emailsArray.indexOf(user.email) === -1);
	if (nonExistingUserArray.length !== 0) {
		const msg_users = await createOrganizationUsers(orgId, nonExistingUserArray);
		orgAdminArray.forEach((user, index) => {
			for (let i = 0; i < nonExistingUserArray.length; i++) {
				if (nonExistingUserArray[i].email === user.email) adminIdArray[index] = msg_users[i].id;
			}
		})
	}

	if (existingUserArray.length !== 0) {
		const msg_users = await grafanaApi.addUsersToOrganization(orgId, existingUserArray);
		orgAdminArray.forEach((user, index) => {
			for (let i = 0; i < existingUserArray.length; i++) {
				if (existingUserArray[i].email === user.email) adminIdArray[index] = msg_users[i].userId;
			}
		})
	}
	return adminIdArray;
}

export const getOrganizationAdmin = async (orgId: number): Promise<Partial<IUser>[]> => {
	const query = `SELECT grafanadb.user.id, name, login, email, telegram_id as "telegramId"
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.org_user.role = $2`
	const result = await pool.query(query, [orgId, "Admin"]);
	return result.rows;
}

export const getOrganizationsManagedByUserId = async (userId: number): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, acronym, address1 as address, city,
	                grafanadb.org.zip_code as "zipCode", state, country, building_id AS "buildingId"
					FROM grafanadb.org
					INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id
					WHERE grafanadb.org_user.user_id = $1 AND grafanadb.org_user.role = $2
					ORDER BY id ASC`;
	const result = await pool.query(query, [userId, "Admin"]);
	return result.rows;
}


export const organizationsWhichTheLoggedUserIsUser = async (userId: number): Promise<IOrganizationWichTheLoggedUserIsUser[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, acronym, address1 as address, city,
					grafanadb.org.zip_code as "zipCode", state, country,
					grafanadb.org.building_id AS "buildingId",
					grafanadb.org_user.role AS "roleInOrg"
					FROM grafanadb.org
					INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id
					WHERE grafanadb.org_user.user_id = $1
					ORDER BY id ASC`;
	const result = await pool.query(query, [userId]);
	return result.rows;
}

export const addOrgUsersToDefaultOrgGroup = async (orgId: number, usersAddedToOrg: CreateUserDto[]): Promise<IMessage> => {
	const group = await getDefaultOrgGroup(orgId);
	const groupMembersArray: CreateGroupMemberDto[] = [];
	usersAddedToOrg.forEach(user => {
		const groupMember = {
			userId: user.id,
			firstName: user.firstName,
			surname: user.surname,
			email: user.email,
			roleInGroup: (user.roleInOrg as RoleInGroupOption)
		};
		groupMembersArray.push(groupMember);
	})
	const message = await addMembersToGroup(group, groupMembersArray);
	return message;
}

export const updateOrgUserRoleInDefaultOrgGroup = async (orgId: number, user: IUserInOrg, newRoleInOrg: string): Promise<IMessage> => {
	const group = await getDefaultOrgGroup(orgId);
	const groupMembersArray: CreateGroupMemberDto[] = [{
		userId: user.userId,
		firstName: user.firstName,
		surname: user.surname,
		email: user.email,
		roleInGroup: (newRoleInOrg as RoleInGroupOption)
	}];

	const existentGroupMemberArray: IGroupMember[] = [
		{
			groupId: group.id,
			userId: user.userId,
			firstName: user.firstName,
			surname: user.surname,
			email: user.email,
			roleInGroup: (user.roleInOrg as RoleInGroupOption)
		}
	];

	const message = await udpateRoleMemberInGroup(group, groupMembersArray, existentGroupMemberArray);
	return message;
}


