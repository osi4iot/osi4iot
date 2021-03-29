import { v4 as uuidv4 } from "uuid";
import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import IEmailNotificationChannelSettings from "../../GrafanaApi/interfaces/EmailNotificationChannelSettings";;
import IGrafanaNotificationChannelSettings from "../../GrafanaApi/interfaces/GrafanaNotificationChannelSettings";
import IFolderPermission from "../../GrafanaApi/interfaces/FolderPermission";
import { getOrganizationKey } from "../organization/organizationDAL";
import CreateGroupDto from "./interfaces/group.dto";
import IGroup from "./interfaces/Group.interface";
import {
	sendChangeGroupDataInformationEmail,
	sendGroupAdminInvitationEmail,
	sendGroupMemberInvitationEmail,
	sendRemoveGroupInformationEmail,
	sendRoleInGroupChangeInformationEmail
} from "./groupEmailFactory";
import { isThisUserOrgAdmin } from "../user/userDAL";
import IGroupMember from "./interfaces/GroupMember.interface";
import CreateGroupMemberDto from "./interfaces/groupMember.dto";
import IMessage from "../../GrafanaApi/interfaces/Message";
import { RoleInGroupOption } from "./interfaces/RoleInGroupOptions";
import CreateGroupAdminDto from "./interfaces/groupAdmin.dto";
import UpdateGroupDto from "./interfaces/group_update.dto";
import INotificationChannel from "./interfaces/NotificationChannel";


export const defaultOrgGroupName =  (orgName: string, orgAcronym: string): string => {
	let groupName: string = `${orgName.replace(/ /g, "_")}_general`;
	if (groupName.length > 50) groupName = `${orgAcronym.replace(/ /g, "_").toUpperCase()}_general`;
	return groupName;
};

export const createGroup = async (orgId: number, groupInput: CreateGroupDto, orgName: string, isOrgDefaultGroup: boolean = false): Promise<IGroup> => {
	let group: IGroup;
	const groupUid = uuidv4().replace(/-/g, "_");
	if (!groupInput.telegramInvitationLink) groupInput.telegramInvitationLink = "";
	if (!groupInput.telegramChatId) groupInput.telegramChatId = "";
	if (!groupInput.email) groupInput.email = `${groupInput.acronym}@test.com`;
	const teamData = { ...groupInput, orgId };
	const orgKey = await getOrganizationKey(orgId);
	const team = await grafanaApi.createTeam(teamData);
	const folderData = { title: groupInput.name, email: groupInput.email };
	const folder = await grafanaApi.createFolder(folderData, orgKey);
	const teamId = team.teamId;
	const folderId = folder.id;
	const folderUid = folder.uid;
	const telegramInvitationLink = groupInput.telegramInvitationLink;
	const telegramChatId = groupInput.telegramChatId;
	const folderPermission = groupInput.folderPermission;

	const permissionsArray: IFolderPermission[] = [{
		teamId,
		permission: folderPermission
	}];

	if (isOrgDefaultGroup) {
		groupInput.groupAdminDataArray.forEach(admin => permissionsArray.push({ userId: admin.userId, permission: "Admin" }));
	} else {
		groupInput.groupAdminDataArray.forEach(admin => permissionsArray.push({ userId: admin.userId, permission: "Editor" }));
	}
	await setFolderPermissions(orgId, folderId, permissionsArray);
	const groupAdminIdArray = groupInput.groupAdminDataArray.map(admin => ({ userId: admin.userId }));
	await grafanaApi.addTeamMembers(teamId, groupAdminIdArray);
	groupInput.groupAdminDataArray.forEach(groupAdmin => groupAdmin.roleInGroup = "Admin" as RoleInGroupOption);
	await teamMembersPermissions(teamId, groupInput.groupAdminDataArray)
	const emailNotificationChannelData = {
		uid: uuidv4(),
		name: `${groupInput.acronym}_email_NC`,
		type: "email",
		isDefault: false,
		sendReminder: false,
		settings: {
			addresses: groupInput.groupAdminDataArray.map(admin => admin.email).join()
		}
	}
	const emailNotificationChannel = await grafanaApi.createNotificationChannel(orgKey, emailNotificationChannelData);
	const emailNotificationChannelId = emailNotificationChannel.id;

	const telegramNotificationChannelData = {
		uid: uuidv4(),
		name: `${groupInput.acronym}_telegram_NC`,
		type: "telegram",
		isDefault: false,
		sendReminder: false,
		settings: {
			bottoken: process.env.TELEGRAM_BOTTOKEN,
			chatid: telegramChatId,
			uploadImage: true
		}
	}
	const telegramNotificationChannel = await grafanaApi.createNotificationChannel(orgKey, telegramNotificationChannelData);
	const telegramNotificationChannelId = telegramNotificationChannel.id;

	group = {
		orgId,
		teamId,
		folderId,
		folderUid,
		name: groupInput.name,
		acronym: groupInput.acronym,
		groupUid,
		telegramInvitationLink,
		telegramChatId,
		emailNotificationChannelId,
		telegramNotificationChannelId,
		isOrgDefaultGroup
	}

	await createView(groupUid);
	const groupResponse = await insertGroup(group);
	group.id = groupResponse.id;
	group.folderPermission = folderPermission;;
	await sendGroupAdminInvitationEmail(orgName, group, groupInput.groupAdminDataArray);
	return group;
}

export const updateGroup = async (newGroupData: UpdateGroupDto, existentGroup: IGroup): Promise<void> => {
	newGroupData.acronym = newGroupData.acronym.replace(/ /g, "_").toUpperCase();
	const groupData: IGroup = { ...existentGroup, ...newGroupData };
	await updateGroupById(groupData);
	if (groupData.folderPermission !== existentGroup.folderPermission) {
		await updateFolderPermissionsForTeam(groupData);
	}

	if (groupData.name !== existentGroup.name) {
		await updateTeamName(groupData.teamId, groupData.name);
		await updateFolderName(groupData.folderId, groupData.name);
	}

	if (groupData.acronym !== existentGroup.acronym) {
		const emailNotifChannelName = `${groupData.acronym}_email_NC`
		await updateNotificationChannelName(groupData.emailNotificationChannelId, emailNotifChannelName);

		const telegramNotifChannelName = `${groupData.acronym}_telegram_NC`
		await updateNotificationChannelName(groupData.telegramNotificationChannelId, telegramNotifChannelName);
	}
	await sendChangeGroupDataInformationEmail(groupData, existentGroup.name);
}

const updateTeamName = async (teamId: number, newName: string): Promise<void> => {
	await pool.query('UPDATE grafanadb.team SET name = $1 WHERE id = $2', [newName, teamId]);
}

const updateFolderName = async (folderId: number, newTitle: string): Promise<void> => {
	await pool.query('UPDATE grafanadb.dashboard SET title = $1 WHERE id = $2', [newTitle, folderId]);
}


export const getAllGroups = async (): Promise<IGroup[]> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId",
				grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				ORDER BY id ASC;`;
	const result = await pool.query(query);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows;
}

export const getGroupsManagedByUserId = async (userId: number): Promise<IGroup[]> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId",
				grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.permission = $1 OR grafanadb.team_member.permission = $2
				ORDER BY id ASC;`;
	const result = await pool.query(query, [2, 4]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows;
}

export const getAllGroupsInOrganization = async (orgId: number): Promise<IGroup[]> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId",
				grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				WHERE grafanadb.group.org_id = $1
				ORDER BY id ASC;`;
	const result = await pool.query(query, [orgId]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows;
}

export const getAllGroupsInOrgArray = async (orgIdsArray: number[]): Promise<IGroup[]> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId",
				grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				WHERE grafanadb.group.org_id = ANY($1::bigint[])
				ORDER BY id ASC;`;
	const result = await pool.query(query, [orgIdsArray]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows;
}

export const getGroupByWithFolderPermissionProp = async (propName: string, propValue: (string | number)): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				WHERE grafanadb.group.${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows[0].folderPermission = permissionCodes[result.rows[0].folderPermission];
	return result.rows[0];
}

export const getGroupByProp = async (propName: string, propValue: (string | number)): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				WHERE grafanadb.group.${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0];
}

export const getDefaultOrgGroup = async (orgId: number): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup"
				FROM grafanadb.group
				WHERE grafanadb.group.org_id = $1 AND is_org_default_group = $2;`;
	const result = await pool.query(query, [orgId, true]);
	return result.rows[0];
};


export const insertGroup = async (group: IGroup): Promise<IGroup> => {
	const response = await pool.query(`INSERT INTO grafanadb.group (org_id, team_id, folder_id,
					folder_uid, name, acronym, group_uid,
					telegram_invitation_link, telegram_chatid,
					email_notification_channel_id,
					telegram_notification_channel_id, is_org_default_group)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
					RETURNING *`,
		[
			group.orgId,
			group.teamId,
			group.folderId,
			group.folderUid,
			group.name,
			group.acronym,
			group.groupUid,
			group.telegramInvitationLink,
			group.telegramChatId,
			group.emailNotificationChannelId,
			group.telegramNotificationChannelId,
			group.isOrgDefaultGroup
		])
	return response.rows[0];
};

export const updateGroupById = async (group: IGroup): Promise<void> => {
	const query = `UPDATE grafanadb.group SET name = $1, acronym = $2,
				telegram_invitation_link = $3,
				telegram_chatid = $4
				WHERE grafanadb.group.id = $5;`;
	const result = await pool.query(query, [
		group.name,
		group.acronym,
		group.telegramInvitationLink,
		group.telegramChatId,
		group.id
	]);
}

export const createView = async (groupUid: string): Promise<void> => {
	const viewName = `Table_${groupUid}`;
	await pool.query(`CREATE VIEW iot_datasource.${viewName} AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_uid = '${groupUid}'`);
};

export const deleteView = async (groupUid: string): Promise<void> => {
	const viewName = `Table_${groupUid}`;
	await pool.query(`DROP VIEW iot_datasource.${viewName}`);
};

export const changeGroupUidByUid = async (group: IGroup): Promise<string> => {
	const oldGroupUid = group.groupUid;
	const newGroupUid = uuidv4().replace(/-/g, "_");
	await pool.query('UPDATE grafanadb.group SET group_uid = $1 WHERE group_uid = $2',
		[newGroupUid, oldGroupUid]);
	await deleteView(oldGroupUid);
	await createView(newGroupUid);
	return newGroupUid;
};

export const deleteGroup = async (group: IGroup, orgKey: string): Promise<void> => {
	await pool.query('DELETE FROM grafanadb.group WHERE id = $1', [group.id]);
	await grafanaApi.deleteFolderByUid(group.folderUid, orgKey);
	await grafanaApi.deleteTeamById(group.teamId);
	await deleteView(group.groupUid);
};

export const deleteGroupByName = async (groupName: string, orgKey: string): Promise<void> => {
	const group = await getGroupByProp("name", groupName);
	await pool.query('DELETE FROM grafanadb.group WHERE id = $1', [group.id]);
	await grafanaApi.deleteFolderByUid(group.folderUid, orgKey);
	await grafanaApi.deleteTeamById(group.teamId);
	await deleteView(group.groupUid);
};

type settingType = IGrafanaNotificationChannelSettings | IEmailNotificationChannelSettings;
export const updateNotificationChannelSettings = async (id: number, settings: settingType): Promise<void> => {
	await pool.query('UPDATE grafanadb.alert_notification SET settings = $1 WHERE id = $2', [settings, id]);
};

export const updateNotificationChannelName = async (id: number, newName: string): Promise<void> => {
	await pool.query('UPDATE grafanadb.alert_notification SET name = $1 WHERE id = $2', [newName, id]);
};

export const getNotificationChannelSettings = async (id: number): Promise<settingType> => {
	const result = await pool.query('SELECT settings FROM grafanadb.alert_notification WHERE id = $1', [id]);
	return result.rows[0];
};

export const getNotificationChannelName = async (id: number): Promise<string> => {
	const result = await pool.query('SELECT name FROM grafanadb.alert_notification WHERE id = $1', [id]);
	return result.rows[0].name;
};

export const getNotificationChannelUid = async (id: number): Promise<string> => {
	const result = await pool.query('SELECT uid FROM grafanadb.alert_notification WHERE id = $1', [id]);
	return result.rows[0].uid;
};

export const getNotificationChannelById = async (id: number): Promise<INotificationChannel> => {
	const result = await pool.query(
		`SELECT id, org_id AS "orgId", name, type, settings, created
		is_default AS "isDefault", frequency, sendReminder AS "sendReminder",
		disable_resolve_message AS "disableResolveMessage",
		uid, secure_settings AS "secureSettings"
	  	FROM grafanadb.alert_notification WHERE id = $1`, [id]);
	return result.rows[0];
};


export const setFolderPermissionsForNewAddedMember = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	// const folderPermission = await getGroupFolderPermission(group);
	let groupMembersWithEditOrAdminPrivileges: CreateGroupMemberDto[] = [];
	if (group.folderPermission === "Edit") {
		groupMembersWithEditOrAdminPrivileges = groupMembersArray.filter(member => (member.roleInGroup === "Admin"));
	} else if (group.folderPermission === "Viewer") {
		groupMembersWithEditOrAdminPrivileges = groupMembersArray.filter(member => (member.roleInGroup === "Admin" || member.roleInGroup === "Editor"));
	}
	await giveFolderPermissionsForMemberArray(group, groupMembersWithEditOrAdminPrivileges);
}

const getGroupFolderPermission = async (group: IGroup): Promise<string> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const result = await pool.query('SELECT permission FROM grafanadb.dashboard_acl WHERE dashboard_id = $1 AND team_id  = $2',
		[group.folderId, group.teamId]);
	return permissionCodes[result.rows[0]];
};

const updateFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (let i = 0; i < groupMembersArray.length; i++) {
		const now = new Date();
		const permission = permissionCodes.indexOf(groupMembersArray[i].roleInGroup);
		const query = pool.query(`UPDATE grafanadb.dashboard_acl SET permission = $1, udpated = $2 WHERE dashboard_id = $3 AND user_id = $4`,
			[permission, now, group.folderId, groupMembersArray[i].userId]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}

const giveFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (let i = 0; i < groupMembersArray.length; i++) {
		const now = new Date();
		const permission = permissionCodes.indexOf(groupMembersArray[i].roleInGroup);
		const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, user_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
			[group.orgId, group.folderId, groupMembersArray[i].userId, permission, now, now]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}


export const removeFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (let i = 0; i < groupMembersArray.length; i++) {
		const query = pool.query(`DELETE FROM grafanadb.dashboard_acl WHERE dashboard_id = $1 AND user_id = $2`,
			[group.folderId, groupMembersArray[i].userId]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}


const setFolderPermissions = async (orgId: number, folderId: number, permissionsArray: IFolderPermission[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (let i = 0; i < permissionsArray.length; i++) {
		const now = new Date()
		if (permissionsArray[i].teamId) {
			const permission = permissionCodes.indexOf(permissionsArray[i].permission);
			const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, team_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
				[orgId, folderId, permissionsArray[i].teamId, permission, now, now]);
			folderPermissionQueries.push(query);
		} else if (permissionsArray[i].userId) {
			const permission = permissionCodes.indexOf(permissionsArray[i].permission);
			const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, user_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
				[orgId, folderId, permissionsArray[i].userId, permission, now, now]);
			folderPermissionQueries.push(query);
		}
	}
	await Promise.all(folderPermissionQueries);
	await pool.query('UPDATE grafanadb.dashboard SET has_acl = $1 WHERE id = $2', [true, folderId]);
}

const updateFolderPermissionsForTeam = async (group: IGroup): Promise<void> => {
	const now = new Date()
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const permission = permissionCodes.indexOf(group.folderPermission);
	await pool.query(`UPDATE grafanadb.dashboard_acl SET permission = $1, updated = $2 WHERE dashboard_id = $3 AND team_id = $4`,
		[permission, now, group.folderId, group.teamId]);
}

export const teamMembersPermissions = async (teamId: number, groupMembersArray: (CreateGroupMemberDto | CreateGroupAdminDto)[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const teamMembersPermissionsQueries = [];
	for (const groupMember of groupMembersArray) {
		const now = new Date();
		const permission = permissionCodes.indexOf(groupMember.roleInGroup);
		const query = pool.query(
			`UPDATE grafanadb.team_member SET permission = $1, updated = $2 WHERE team_id = $3 AND user_id = $4`,
			[permission, now, teamId, groupMember.userId]);
		teamMembersPermissionsQueries.push(query);
	}
	await Promise.all(teamMembersPermissionsQueries);
}


export const haveThisUserGroupAdminPermissions = async (userId: number, teamId: number, orgId: number): Promise<boolean> => {
	let havePermissions = false;
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.team_member WHERE team_id = $1 AND user_id = $2 AND permission = $3',
		[teamId, userId, 4]);

	if (result.rows[0].count === "0") {
		havePermissions = await isThisUserOrgAdmin(userId, orgId);
	}
	return havePermissions;

}

export const getNumberOfGroupMemberWithAdminRole = async (teamId: number): Promise<number> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.team_member WHERE team_id = $1 AND permission = $2',
		[teamId, 4]);
	return parseInt(result.rows[0].count, 10);
}

export const getGroupMembers = async (group: IGroup): Promise<IGroupMember[]> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.user.id AS "userId", grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.user.telegram_id as "telegramId", grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					WHERE grafanadb.team_member.team_id = $1`
	const result = await pool.query(query, [group.teamId]);
	result.rows.forEach(member => member.roleInGroup = permissionCodes[member.roleInGroup]);
	return result.rows;
};

export const getGroupMembersByEmailsArray = async (group: IGroup, emailsArray: string[]): Promise<IGroupMember[]> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.user.id AS "userId", grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.user.telegram_id as "telegramId", grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					WHERE grafanadb.team_member.team_id = $1 AND grafanadb.user.email =  ANY($2::varchar(190)[])`
	const result = await pool.query(query, [group.teamId, emailsArray]);
	result.rows.forEach(member => member.roleInGroup = permissionCodes[member.roleInGroup]);
	return result.rows;
};

export const getGroupMemberByProp = async (group: IGroup, propName: string, propValue: (string | number)): Promise<IGroupMember> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.user.id AS "userId", grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.user.telegram_id as "telegramId", grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					WHERE grafanadb.team_member.team_id = $1
					AND  grafanadb.user.${propName} = $2`
	const result = await pool.query(query, [group.teamId, propValue]);
	if (result.rows[0]) result.rows[0].roleInGroup = permissionCodes[result.rows[0].roleInGroup];
	return result.rows[0];
};

export const addMembersToGroup = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<IMessage> => {
	const groupMembersIdArray = groupMembersArray.map(user => ({ userId: user.userId}));
	const msgArray = await grafanaApi.addTeamMembers(group.teamId, groupMembersIdArray);
	const groupMembersAddedArray: CreateGroupMemberDto[] = []
	msgArray.forEach((msg, index) => {
		if (msg === "Member added to Team") groupMembersAddedArray.push(groupMembersArray[index]);
	})
	await teamMembersPermissions(group.teamId, groupMembersAddedArray);
	await setFolderPermissionsForNewAddedMember(group, groupMembersAddedArray);

	const oldNotificationEmailSettings = await getNotificationChannelSettings(group.emailNotificationChannelId);
	const oldAddress = (oldNotificationEmailSettings as IEmailNotificationChannelSettings).addresses;
	const newAddress = `${oldAddress},${groupMembersAddedArray.map(member => member.email).join()}`;
	const newSettings = { addresses: newAddress };
	await updateNotificationChannelSettings(group.emailNotificationChannelId, newSettings);

	await sendGroupMemberInvitationEmail(group, groupMembersAddedArray);
	let message: IMessage;
	if (groupMembersAddedArray.length === 0) {
		if (groupMembersArray.length === 1) {
			message = { message: `The user indicated are already member of the group` }
		} else if (groupMembersArray.length > 1) {
			message = { message: `All the users indicated are already members of the group` }
		}
	} else if (groupMembersAddedArray.length === 1) {
		message = { message: `A new member has been added to the group` }
	} else if (groupMembersAddedArray.length > 1) {
		message = { message: `Have been added ${groupMembersAddedArray.length} new members to the group` }
	}
	return message;
};


export const udpateRoleMemberInGroup = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[],
	existentGroupMemberArray: IGroupMember[]): Promise<IMessage> => {
	const groupMembersToUpdate: CreateGroupMemberDto[] = [];
	const groupMembersToAddFolderPermissions: CreateGroupMemberDto[] = [];
	const groupMembersToRemoveFolderPermissions: CreateGroupMemberDto[] = [];
	const groupMembersToChangeFolderPermissions: CreateGroupMemberDto[] = [];
	for (let i = 0; i < groupMembersArray.length; i++) {
		if (groupMembersArray[i].roleInGroup !== existentGroupMemberArray[i].roleInGroup) {
			groupMembersToUpdate.push(groupMembersArray[i]);
			if (existentGroupMemberArray[i].roleInGroup === "Viewer") {
				groupMembersToAddFolderPermissions.push(groupMembersArray[i]);
			} else if (existentGroupMemberArray[i].roleInGroup === "Editor") {
				if (groupMembersArray[i].roleInGroup === "Viewer") {
					groupMembersToRemoveFolderPermissions.push(groupMembersArray[i]);
				} else if (groupMembersArray[i].roleInGroup === "Admin") {
					groupMembersToChangeFolderPermissions.push(groupMembersArray[i]);
				}
			} else if (existentGroupMemberArray[i].roleInGroup === "Admin") {
				if (groupMembersArray[i].roleInGroup === "Viewer") {
					groupMembersToRemoveFolderPermissions.push(groupMembersArray[i]);
				} else if (groupMembersArray[i].roleInGroup === "Editor") {
					groupMembersToChangeFolderPermissions.push(groupMembersArray[i]);
				}
			}
		}
	}
	await teamMembersPermissions(group.teamId, groupMembersToUpdate);
	if (groupMembersToAddFolderPermissions.length !== 0) {
		await giveFolderPermissionsForMemberArray(group, groupMembersToAddFolderPermissions)
	}
	if (groupMembersToRemoveFolderPermissions.length !== 0) {
		await removeFolderPermissionsForMemberArray(group, groupMembersToRemoveFolderPermissions)
	}
	if (groupMembersToChangeFolderPermissions.length !== 0) {
		await updateFolderPermissionsForMemberArray(group, groupMembersToChangeFolderPermissions)
	}
	await sendRoleInGroupChangeInformationEmail(group, groupMembersToUpdate);
	let message: IMessage;
	if (groupMembersToUpdate.length === 0) {
		message = { message: `The group member roles indicated are identical to the existing ones` }
	} else if (groupMembersToUpdate.length === 1) {
		message = { message: `The role of the member in the group has been changed` }
	} else if (groupMembersToUpdate.length > 1) {
		message = { message: `The rol of ${groupMembersToUpdate.length} group members has been changed` }
	}
	return message;
};


export const removeMembersInGroup = async (group: IGroup, groupMembersToRemove: IGroupMember[]): Promise<IMessage> => {
	if (groupMembersToRemove.length === 0) return { message: "All non admin members has been already removed of the group" };
	const groupMembersToRemoveFolderPermissions: CreateGroupMemberDto[] = [];
	// tslint:disable-next-line: prefer-for-of
	for (let i = 0; i < groupMembersToRemove.length; i++) {
		if (groupMembersToRemove[i].roleInGroup === "Admin" || groupMembersToRemove[i].roleInGroup === "Editor") {
			groupMembersToRemoveFolderPermissions.push(groupMembersToRemove[i]);
		}
	}

	if (groupMembersToRemoveFolderPermissions.length !== 0) {
		await removeFolderPermissionsForMemberArray(group, groupMembersToRemoveFolderPermissions)
	}

	const userIdsArray = groupMembersToRemove.map(member => member.userId);
	const msgArray = await grafanaApi.removeMembersFromTeam(group.teamId, userIdsArray);
	let numGroupMembersRemoved = 0;
	msgArray.forEach(msg => {
		if (msg.message === "Team Member removed") numGroupMembersRemoved++;
	});
	await sendRemoveGroupInformationEmail(group, groupMembersToRemove);
	let message: string;
	if (numGroupMembersRemoved === 0) message = "No one member has been removed of the group";
	else if (numGroupMembersRemoved === 1) message = "Has been removed one member of the group";
	else if (numGroupMembersRemoved > 1) message = `Have been removed ${numGroupMembersRemoved} member of the group`;
	return { message };
};






