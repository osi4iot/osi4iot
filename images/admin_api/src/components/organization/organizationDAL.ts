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
import UpdateOrganizationDto from "./interfaces/updateOrganization.dto";
import { createNodeRedInstance, deleteNodeRedInstanceById } from "../nodeRedInstance/nodeRedInstanceDAL";
import INodeRedInstance from "../nodeRedInstance/nodeRedInstance.interface";
import CreateNodeRedInstanceDto from "../nodeRedInstance/nodeRedInstance.dto";

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
	const query = `UPDATE grafanadb.org SET name = $1, acronym = $2, role = $3, address1 = $4,  city = $5, zip_code = $6, state = $7, country = $8, building_id = $9, org_hash = $10,  mqtt_access_control = $11  WHERE ${propName} = $12;`;
	const queryArray =
		[
			orgData.name,
			orgData.acronym,
			orgData.role,
			orgData.buildingId,
			orgData.orgHash,
			orgData.mqttAccessControl,
			propValue
		];
	await pool.query(query, queryArray);
}

export const updateOrganizationHashById = async (orgId: number, newOrgHash: string): Promise<void> => {
	const query = `UPDATE grafanadb.org SET org_hash = $1 WHERE id = $2;`;
	const queryArray =
		[
			newOrgHash,
			orgId
		];
	await pool.query(query, queryArray);
}

export const getApiKeyIdByName = async (apiKeyName: string): Promise<number> => {
	const result = await pool.query(`SELECT id FROM grafanadb.api_key WHERE name = $1`,
		[apiKeyName]);
	return result.rows[0].id as number;
}

export const insertOrganizationToken = async (orgId: number, apiKeyId: number, hashedApiKey: string): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.org_token (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`,
		[orgId, apiKeyId, hashedApiKey]);
};

export const getOrganizations = async (): Promise<IOrganization[]> => {
	const query = `SELECT id, org.name, acronym, role, 
	                grafana.building.city, grafana.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl"
					FROM grafanadb.org
					INNER JOIN grafana.building ON grafanadb.org.building_id = grafana.building.id
					ORDER BY id ASC;`;
	const result = await pool.query(query);
	return result.rows as IOrganization[];
}

export const getOrganizationsWithIdsArray = async (orgIdsArray: number[]): Promise<IOrganization[]> => {
	const query = `SELECT id, org.name, acronym, role, 
					grafana.building.city, grafana.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl"
					FROM grafanadb.org
					INNER JOIN grafana.building ON grafanadb.org.building_id = grafana.building.id
					WHERE id = ANY($1::integer[])
					ORDER BY id ASC;`;
	const result = await pool.query(query, [orgIdsArray]);
	return result.rows as IOrganization[];
}

export const getNumOrganizations = async (): Promise<number> => {
	const query = `SELECT COUNT(*) FROM grafanadb.org;`;
	const result = await pool.query(query);
	return parseInt(result.rows[0].count, 10);
}

export const getOrganizationByProp = async (propName: string, propValue: (string | number)): Promise<IOrganization> => {
	const query = `SELECT id, org.name, acronym, role, 
					grafana.building.city, grafana.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl"
					FROM grafanadb.org
					INNER JOIN grafana.building ON grafanadb.org.building_id = grafana.building.id
					WHERE ${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0] as IOrganization;
}

export const getOrganizationKey = async (orgId: number): Promise<string> => {
	const query = `SELECT organization_key as "orgKey"
					FROM grafanadb.org_token WHERE org_id = $1;`;
	const result = await pool.query(query, [orgId]);
	const apiKey = decrypt(result.rows[0].orgKey);
	return apiKey;
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
	orgAdminArray.forEach(() => adminIdArray.push(0));
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
	const query = `SELECT grafanadb.user.id, name, login, email
					FROM grafanadb.user
					INNER JOIN grafanadb.org_user ON grafanadb.org_user.user_id = grafanadb.user.id
					WHERE grafanadb.org_user.org_id = $1 AND grafanadb.org_user.role = $2`
	const result = await pool.query(query, [orgId, "Admin"]);
	return result.rows as Partial<IUser>[];
}

export const getOrganizationsManagedByUserId = async (userId: number): Promise<IOrganization[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, acronym,
					grafanadb.org.role, grafana.building.city, grafana.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl"
					FROM grafanadb.org
					INNER JOIN grafana.building ON grafanadb.org.building_id = grafana.building.id					
					WHERE grafanadb.org_user.user_id = $1 AND grafanadb.org_user.role = $2
					ORDER BY id ASC`;
	const result = await pool.query(query, [userId, "Admin"]);
	return result.rows as IOrganization[];
}


export const organizationsWhichTheLoggedUserIsUser = async (userId: number): Promise<IOrganizationWichTheLoggedUserIsUser[]> => {
	const query = `SELECT grafanadb.org.id, grafanadb.org.name, acronym,
					grafanadb.org.role, grafana.building.city, grafana.building.country,
					building_id AS "buildingId", org_hash AS "orgHash",
					mqtt_access_control AS "mqttAccessControl"
					FROM grafanadb.org
					INNER JOIN grafana.building ON grafanadb.org.building_id = grafana.building.id
					INNER JOIN grafanadb.org_user ON grafanadb.org.id = grafanadb.org_user.org_id
					WHERE grafanadb.org_user.user_id = $1
					ORDER BY id ASC`;
	const result = await pool.query(query, [userId]);
	return result.rows as IOrganizationWichTheLoggedUserIsUser[];
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

export const updateNodeRedInstancesInOrg = async (currentNodeRedInstancesInOrg: INodeRedInstance[], newOrganizationData: UpdateOrganizationDto) => {
	const nriToCreateQueries = [];
	const nriToRemoveQueries = [];
	if (currentNodeRedInstancesInOrg.length > newOrganizationData.nriHashes.length) {
		const newNriHashes = newOrganizationData.nriHashes;
		const nodeRedInstancesToRemove = currentNodeRedInstancesInOrg.filter(nri => !newNriHashes.includes(nri.nriHash));
		for (const nodeRedInstance of nodeRedInstancesToRemove) {
			nriToRemoveQueries.push(deleteNodeRedInstanceById(nodeRedInstance.id));
		}
	}

	if (currentNodeRedInstancesInOrg.length < newOrganizationData.nriHashes.length) {
		const newNriHashes = newOrganizationData.nriHashes;
		const currentNodeRedInstanceHashes = currentNodeRedInstancesInOrg.map(nri => nri.nriHash);
		const nodeRedInstancesHashesToCreate = newNriHashes.filter(nriHash => !currentNodeRedInstanceHashes.includes(nriHash));
		for (const nriHash of nodeRedInstancesHashesToCreate) {
			const orgId = newOrganizationData.id;
			const nodeRedInstancInput: CreateNodeRedInstanceDto = {
				nriHash,
				orgId,
				longitude: 0,
				latitude: 0,
				iconRadio: 1
			}
			nriToCreateQueries.push(createNodeRedInstance(nodeRedInstancInput));
		}
	}

	if (nriToCreateQueries.length !== 0) {
		await Promise.all(nriToCreateQueries);
	}

	if (nriToRemoveQueries.length !== 0) {
		await Promise.all(nriToRemoveQueries);
	}

}

