import { v4 as uuidv4 } from "uuid";
import { logger } from "../../config/winston";
import crypto from 'crypto';
import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import IEmailNotificationChannelSettings from "../../GrafanaApi/interfaces/EmailNotificationChannelSettings";;
import IGrafanaNotificationChannelSettings from "../../GrafanaApi/interfaces/GrafanaNotificationChannelSettings";
import IFolderPermission from "../../GrafanaApi/interfaces/FolderPermission";
import {  getOrganizationKey } from "../organization/organizationDAL";
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
import IMembershipInGroups from "./interfaces/MembershipInGroups.interface";
import { findGroupBounds, findGroupGeojsonData } from "../../utils/geolocation.ts/geolocation";
import { getBuildingByOrgId, getFloorByOrgIdAndFloorNumber } from "../building/buildingDAL";
import arrayCompare from "../../utils/helpers/arrayCompare";
import process_env from "../../config/api_config";
import { updateGroupNodeRedInstanceLocation } from "../nodeRedInstance/nodeRedInstanceDAL";
import timescaledb_pool from "../../config/timescaledb_config";
import { generateGrafanaDataSourceUser } from "./datasourceDAL";
import { updateGroupAssetsLocation } from "../asset/assetDAL";
import { nanoid } from "nanoid";
import { passwordGenerator } from "../../utils/passwordGenerator";

export const defaultOrgGroupName = (orgName: string, orgAcronym: string): string => {
	let groupName = `${orgName} general`;
	if (groupName.length > 50) groupName = `${orgAcronym.replace(/"/g, "").toUpperCase()} general`;
	return groupName;
};

export const createGroup = async (
	orgId: number,
	groupInput: CreateGroupDto,
	orgName: string,
	isOrgDefaultGroup = false
): Promise<IGroup> => {
	const groupUid = uuidv4().replace(/-/g, "_");
	if (!groupInput.telegramInvitationLink) groupInput.telegramInvitationLink = "";
	if (!groupInput.telegramChatId) groupInput.telegramChatId = "";
	if (!groupInput.email) groupInput.email = `${groupInput.acronym}@test.com`;
	const teamData = { ...groupInput, orgId };
	const orgKey = await getOrganizationKey(orgId);
	const team = await grafanaApi.createTeam(orgId, teamData);
	const newFolderUid = uuidv4();
	const folderData = { title: groupInput.name, uid: newFolderUid };
	const folder = await grafanaApi.createFolder(folderData, orgKey);
	const teamId = team.teamId;
	const folderId = folder.id;
	const folderUid = folder.uid;
	const telegramInvitationLink = groupInput.telegramInvitationLink;
	const telegramChatId = groupInput.telegramChatId;
	const folderPermission = groupInput.folderPermission;
	const floorNumber = groupInput.floorNumber;
	const featureIndex = groupInput.featureIndex;
	const floorData = await getFloorByOrgIdAndFloorNumber(orgId, floorNumber);
	let outerBounds: number[][];
	if (floorData) {
		const geoJsonData = findGroupGeojsonData(floorData, featureIndex);
		outerBounds = findGroupBounds(geoJsonData, floorData);
	} else {
		const building = await getBuildingByOrgId(orgId);
		if (building) {
			outerBounds = building.outerBounds;
		} else {
			outerBounds = [[0, 0], [0, 0]];
		}
	}
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
	await grafanaApi.addTeamMembers(orgId, teamId, groupAdminIdArray);
	groupInput.groupAdminDataArray.forEach(groupAdmin => groupAdmin.roleInGroup = "Admin" as RoleInGroupOption);
	await teamMembersPermissions(teamId, groupInput.groupAdminDataArray);
	const emailNotificationChannelData = {
		uid: uuidv4(),
		name: `${groupInput.acronym}_email_NC`,
		type: "email",
		isDefault: false,
		sendReminder: false,
		settings: {
			addresses: groupInput.groupAdminDataArray.map(admin => admin.email).join(";"),
			autoResolve: true,
			httpMethod: "POST",
			severity: "critical"
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
			bottoken: process_env.TELEGRAM_BOTTOKEN,
			chatid: telegramChatId,
			uploadImage: true,
			autoResolve: true,
			httpMethod: "POST",
			severity: "critical"
		}
	}
	const telegramNotificationChannel = await grafanaApi.createNotificationChannel(orgKey, telegramNotificationChannelData);
	const telegramNotificationChannelId = telegramNotificationChannel.id;
	const mqttAccessControl = "Pub & Sub";
	const mqttSalt = nanoid(16).replace(/-/g, "x").replace(/_/g, "X");
	const password = passwordGenerator(20);
	const iterations = 10000;
	const mqttPassword = crypto.pbkdf2Sync(password, mqttSalt, iterations, 50, 'sha256').toString('hex');

	const group: IGroup = {
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
		isOrgDefaultGroup,
		floorNumber,
		featureIndex,
		outerBounds,
		mqttAccessControl,
		mqttPassword,
		mqttSalt
	}

	await createView(group);
	const groupResponse = await insertGroup(group);
	group.id = groupResponse.id;
	group.folderPermission = folderPermission;
	try {
		await sendGroupAdminInvitationEmail(orgName, group, groupInput.groupAdminDataArray);
	} catch (err) {
		logger.log("error", `Email for group admin can not be sended: %s`, err.message);
	}
	return group;
}

export const updateGroup = async (newGroupData: UpdateGroupDto, existentGroup: IGroup): Promise<void> => {
	if (newGroupData.acronym) newGroupData.acronym = newGroupData.acronym.replace(/ /g, "_").toUpperCase();
	const groupData: IGroup = { ...existentGroup, ...newGroupData };
	const featureIndex = groupData.featureIndex;
	const floorData = await getFloorByOrgIdAndFloorNumber(groupData.orgId, groupData.floorNumber);
	const geoJsonDataString = findGroupGeojsonData(floorData, featureIndex);
	if (geoJsonDataString !== "{}") {
		groupData.outerBounds = findGroupBounds(geoJsonDataString, floorData);
		await updateGroupById(groupData);
		if (!arrayCompare(groupData.outerBounds, existentGroup.outerBounds)) {
			await updateGroupAssetsLocation(geoJsonDataString, groupData);
			await updateGroupNodeRedInstanceLocation(geoJsonDataString, groupData)
		}
	}
	let hasGroupChange = false;
	if (groupData.folderPermission && (groupData.folderPermission !== existentGroup.folderPermission)) {
		await updateFolderPermissionsForTeam(groupData);
		hasGroupChange = true;
	}

	if (groupData.name && (groupData.name !== existentGroup.name)) {
		await updateTeamName(groupData.teamId, groupData.name);
		await updateFolderName(groupData.folderId, groupData.name);
		hasGroupChange = true;
	}

	if (groupData.acronym && (groupData.acronym !== existentGroup.acronym)) {
		const emailNotifChannelName = `${groupData.acronym}_email_NC`
		await updateNotificationChannelName(groupData.emailNotificationChannelId, emailNotifChannelName);

		const telegramNotifChannelName = `${groupData.acronym}_telegram_NC`
		await updateNotificationChannelName(groupData.telegramNotificationChannelId, telegramNotifChannelName);
		hasGroupChange = true;
	}

	if (groupData.telegramChatId && (groupData.telegramChatId !== existentGroup.telegramChatId)) {
		const settings = await getNotificationChannelSettings(groupData.telegramNotificationChannelId);
		const oldSettings: IGrafanaNotificationChannelSettings = JSON.parse(settings.settings);
		const newSettings = { bottoken: oldSettings.bottoken, uploadImage: oldSettings.uploadImage, chatid: groupData.telegramChatId };
		await updateNotificationChannelSettings(groupData.telegramNotificationChannelId, newSettings);
		hasGroupChange = true;
	}
	if (hasGroupChange) await sendChangeGroupDataInformationEmail(groupData, existentGroup.name);
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
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				ORDER BY id ASC;`;
	const result = await pool.query(query);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
}

export const getNumGroups = async (): Promise<number> => {
	const query = `SELECT COUNT(*) FROM grafanadb.group;`;
	const result = await pool.query(query);
	return parseInt(result.rows[0].count, 10);
}

export const getGroupsThatCanBeEditatedAndAdministratedByUserId = async (userId: number): Promise<IGroup[]> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId",
				grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				grafanadb.dashboard_acl.permission AS "folderPermission",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.user_id = $1 AND (grafanadb.team_member.permission = $2 OR grafanadb.team_member.permission = $3)
				ORDER BY id ASC;`;
	const result = await pool.query(query, [userId, 2, 4]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
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
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = $2
				ORDER BY id ASC;`;
	const result = await pool.query(query, [userId, 4]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
}

export const getOrgsIdArrayForGroupsManagedByUserId = async (userId: number): Promise<{ orgId: number }[]> => {
	const query = `SELECT DISTINCT grafanadb.group.org_id AS "orgId"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = $2
				ORDER BY grafanadb.group.org_id ASC;`;
	const result = await pool.query(query, [userId, 4]);
	return result.rows as { orgId: number }[];
}

export const groupsWhichTheLoggedUserIsMember = async (userId: number): Promise<IMembershipInGroups[]> => {
	const query = `SELECT grafanadb.group.id AS "groupId", grafanadb.group.org_id AS "orgId",
	            grafanadb.group.name, grafanadb.group.acronym,
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				grafanadb.team_member.permission AS "roleInGroup"
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.user_id = $1
				ORDER BY grafanadb.group.id ASC;`;
	const result = await pool.query(query, [userId]);
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	result.rows.forEach(row => row.roleInGroup = permissionCodes[row.roleInGroup]);
	return result.rows as IMembershipInGroups[];
}

export const getGroupsOfOrgIdWhereUserIdIsMember = async (orgId: number, userId: number): Promise<IGroup[]> => {
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
				WHERE grafanadb.team_member.user_id = $1 AND grafanadb.group.org_id = $2
				ORDER BY id ASC;`;
	const result = await pool.query(query, [userId, orgId]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
}

export const getGroupsWhereUserIdIsMember = async (userId: number): Promise<IGroup[]> => {
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
				WHERE grafanadb.team_member.user_id = $1
				ORDER BY id ASC;`;
	const result = await pool.query(query, [userId]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
}

export const getNumGroupsManagedByUserId = async (userId: number): Promise<number> => {
	const query = `SELECT COUNT(*) FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.team_member ON grafanadb.team_member.team_id = grafanadb.group.team_id
				WHERE grafanadb.team_member.user_id = $1 AND grafanadb.team_member.permission = $2;`;
	const result = await pool.query(query, [userId, 4]);
	return parseInt(result.rows[0].count, 10);
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
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				WHERE grafanadb.group.org_id = $1
				ORDER BY id ASC;`;
	const result = await pool.query(query, [orgId]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
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
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				WHERE grafanadb.group.org_id = ANY($1::bigint[])
				ORDER BY id ASC;`;
	const result = await pool.query(query, [orgIdsArray]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows.forEach(row => row.folderPermission = permissionCodes[row.folderPermission]);
	return result.rows as IGroup[];
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
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				INNER JOIN grafanadb.dashboard_acl ON grafanadb.group.team_id = grafanadb.dashboard_acl.team_id
				WHERE grafanadb.group.${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	const permissionCodes = ["None", "Viewer", "Editor"];
	result.rows[0].folderPermission = permissionCodes[result.rows[0].folderPermission];
	return result.rows[0] as IGroup;
}

export const getGroupByProp = async (propName: string, propValue: (string | number)): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				 mqtt_access_control AS "mqttAccessControl",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				WHERE grafanadb.group.${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0] as IGroup;
}

export const getFullGroupDataById = async (groupId: number): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				mqtt_access_control AS "mqttAccessControl",
				mqtt_password AS "mqttPassword",
				mqtt_salt AS "mqttSalt",
				grafanadb.nodered_instance.id AS "nriInGroupId",
				grafanadb.nodered_instance.nri_hash AS "nriInGroupHash",
				grafanadb.nodered_instance.geolocation[0] AS "nriInGroupIconLongitude",
				grafanadb.nodered_instance.geolocation[1] AS "nriInGroupIconLatitude",
				grafanadb.nodered_instance.icon_radio AS "nriInGroupIconRadio",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				INNER JOIN grafanadb.nodered_instance ON grafanadb.nodered_instance.group_id = grafanadb.group.id
				WHERE grafanadb.group.id = $1;`;
	const result = await pool.query(query, [groupId]);
	return result.rows[0] as IGroup;
}

export const getDefaultOrgGroup = async (orgId: number): Promise<IGroup> => {
	const query = `SELECT grafanadb.group.id, grafanadb.group.org_id AS "orgId", grafanadb.group.team_id AS "teamId",
				grafanadb.group.folder_id AS  "folderId", folder_uid AS  "folderUid",
				name, acronym, group_uid AS  "groupUid",
				telegram_invitation_link AS "telegramInvitationLink",
				telegram_chatid AS "telegramChatId",
				email_notification_channel_id AS "emailNotificationChannelId",
				telegram_notification_channel_id AS "telegramNotificationChannelId",
				is_org_default_group AS "isOrgDefaultGroup",
				floor_number AS "floorNumber",
				feature_index AS "featureIndex",
				outer_bounds AS "outerBounds",
				mqtt_access_control AS "mqttAccessControl",
				grafanadb.group.created, grafanadb.group.updated
				FROM grafanadb.group
				WHERE grafanadb.group.org_id = $1 AND is_org_default_group = $2;`;
	const result = await pool.query(query, [orgId, true]);
	return result.rows[0] as IGroup;
};


export const insertGroup = async (group: IGroup): Promise<IGroup> => {
	const response = await pool.query(`INSERT INTO grafanadb.group (org_id, team_id, folder_id,
					folder_uid, name, acronym, group_uid,
					telegram_invitation_link, telegram_chatid,
					email_notification_channel_id,
					telegram_notification_channel_id, is_org_default_group,
					floor_number, feature_index, outer_bounds,  mqtt_access_control,
					mqtt_password, mqtt_salt,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
						    $14, $15, $16, $17, $18, NOW(), NOW())
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
		group.isOrgDefaultGroup,
		group.floorNumber,
		group.featureIndex,
		group.outerBounds,
		group.mqttAccessControl,
		group.mqttPassword,
		group.mqttSalt
	])
	return response.rows[0] as IGroup;
};

export const updateGroupById = async (group: IGroup): Promise<void> => {
	const query = `UPDATE grafanadb.group SET name = $1, acronym = $2,
				telegram_invitation_link = $3,
				telegram_chatid = $4,
				floor_number = $5,
				feature_index = $6,
				outer_bounds = $7,
				mqtt_access_control = $8,
				updated = NOW()
				WHERE grafanadb.group.id = $9;`;
	await pool.query(query, [
		group.name,
		group.acronym,
		group.telegramInvitationLink,
		group.telegramChatId,
		group.floorNumber,
		group.featureIndex,
		group.outerBounds,
		group.mqttAccessControl,
		group.id
	]);
}

export const createView = async (group: IGroup): Promise<void> => {
	const viewName = `Table_${group.groupUid}`;
	await timescaledb_pool.query(`CREATE OR REPLACE VIEW iot_datasource.${viewName} AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_uid = '${group.groupUid}';`);
	const dataSourceUser = generateGrafanaDataSourceUser(group.orgId);
	const query1 = `GRANT SELECT ON iot_datasource.${viewName} TO ${dataSourceUser};`;
	await timescaledb_pool.query(query1);
};

export const deleteView = async (groupUid: string): Promise<void> => {
	const viewName = `Table_${groupUid}`;
	await timescaledb_pool.query(`DROP VIEW iot_datasource.${viewName};`);
};

export const changeGroupUidByUid = async (group: IGroup): Promise<string> => {
	const oldGroupUid = group.groupUid;
	const newGroupUid = uuidv4().replace(/-/g, "_");
	await pool.query('UPDATE grafanadb.group SET group_uid = $1 WHERE group_uid = $2',
		[newGroupUid, oldGroupUid]);
	await deleteView(oldGroupUid);
	await createView(group);
	return newGroupUid;
};

export const deleteGroup = async (group: IGroup, orgKey: string): Promise<string> => {
	const response = await pool.query('DELETE FROM grafanadb.group WHERE id = $1 RETURNING *', [group.id]);
	await grafanaApi.deleteFolderByUid(group.orgId, group.folderUid, orgKey);
	await grafanaApi.deleteTeamById(group.orgId, group.teamId);
	await deleteView(group.groupUid);
	await deleteNotificationChannelById(group.telegramNotificationChannelId);
	await deleteNotificationChannelById(group.emailNotificationChannelId);
	let message = "The group could not be deleted";
	if (response.rows[0]) {
		message = "Group deleted successfully";
	}
	return message;
};

type settingType = IGrafanaNotificationChannelSettings | IEmailNotificationChannelSettings;
export const updateNotificationChannelSettings = async (id: number, settings: settingType): Promise<void> => {
	await pool.query('UPDATE grafanadb.alert_notification SET settings = $1 WHERE id = $2', [settings, id]);
};

export const deleteNotificationChannelById = async (id: number): Promise<string> => {
	const response = await pool.query('DELETE FROM grafanadb.alert_notification WHERE id = $1 RETURNING *', [id]);
	let message = "Alert notification could not be deleted";
	if (response.rows[0]) message = "Alert notification deleted successfully";
	return message;
};

export const updateNotificationChannelName = async (id: number, newName: string): Promise<void> => {
	await pool.query('UPDATE grafanadb.alert_notification SET name = $1 WHERE id = $2', [newName, id]);
};

export const getNotificationChannelSettings = async (id: number): Promise<any> => {
	const result = await pool.query('SELECT settings FROM grafanadb.alert_notification WHERE id = $1', [id]);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return result.rows[0];
};

export const getNotificationChannelName = async (id: number): Promise<string> => {
	const result = await pool.query('SELECT name FROM grafanadb.alert_notification WHERE id = $1', [id]);
	return result.rows[0].name as string;
};

export const getNotificationChannelUid = async (id: number): Promise<string> => {
	const result = await pool.query('SELECT uid FROM grafanadb.alert_notification WHERE id = $1', [id]);
	return result.rows[0].uid as string;
};

export const getNotificationChannelById = async (id: number): Promise<INotificationChannel> => {
	const result = await pool.query(
		`SELECT id, org_id AS "orgId", name, type, settings, created
		is_default AS "isDefault", frequency, sendReminder AS "sendReminder",
		disable_resolve_message AS "disableResolveMessage",
		uid, secure_settings AS "secureSettings"
	  	FROM grafanadb.alert_notification WHERE id = $1`, [id]);
	return result.rows[0] as INotificationChannel;
};


export const setFolderPermissionsForNewAddedMember = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	let groupMembersWithEditOrAdminPrivileges: CreateGroupMemberDto[] = [];
	if (group.folderPermission === "Edit") {
		groupMembersWithEditOrAdminPrivileges = groupMembersArray.filter(member => (member.roleInGroup === "Admin"));
	} else if (group.folderPermission === "Viewer") {
		groupMembersWithEditOrAdminPrivileges = groupMembersArray.filter(member => (member.roleInGroup === "Admin" || member.roleInGroup === "Editor"));
	}
	await giveFolderPermissionsForMemberArray(group, groupMembersWithEditOrAdminPrivileges);
}

const updateFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (const groupMember of groupMembersArray) {
		const now = new Date();
		const permission = permissionCodes.indexOf(groupMember.roleInGroup);
		const query = pool.query(`UPDATE grafanadb.dashboard_acl SET permission = $1, updated = $2 WHERE dashboard_id = $3 AND user_id = $4`,
			[permission, now, group.folderId, groupMember.userId]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}

const giveFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (const groupMember of groupMembersArray) {
		const now = new Date();
		const permission = permissionCodes.indexOf(groupMember.roleInGroup);
		const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, user_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
			[group.orgId, group.folderId, groupMember.userId, permission, now, now]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}


export const removeFolderPermissionsForMemberArray = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<void> => {
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (const groupMember of groupMembersArray) {
		const query = pool.query(`DELETE FROM grafanadb.dashboard_acl WHERE dashboard_id = $1 AND user_id = $2`,
			[group.folderId, groupMember.userId]);
		folderPermissionQueries.push(query);
	}
	await Promise.all(folderPermissionQueries)
}


const setFolderPermissions = async (orgId: number, folderId: number, permissionsArray: IFolderPermission[]): Promise<void> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const folderPermissionQueries = [];
	// tslint:disable-next-line: prefer-for-of
	for (const permissions of permissionsArray) {
		const now = new Date()
		if (permissions.teamId) {
			const permission = permissionCodes.indexOf(permissions.permission);
			const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, team_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
				[orgId, folderId, permissions.teamId, permission, now, now]);
			folderPermissionQueries.push(query);
		} else if (permissions.userId) {
			const permission = permissionCodes.indexOf(permissions.permission);
			const query = pool.query(`INSERT INTO grafanadb.dashboard_acl (org_id, dashboard_id, user_id, permission, created, updated) VALUES ($1, $2, $3, $4, $5, $6)`,
				[orgId, folderId, permissions.userId, permission, now, now]);
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

	if (result.rows[0].count === 0) {
		havePermissions = await isThisUserOrgAdmin(userId, orgId);
	} else {
		havePermissions = true;
	}
	return havePermissions;
}

export const isThisUserGroupAdmin = async (userId: number, teamId: number): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.team_member WHERE team_id = $1 AND user_id = $2 AND permission = $3',
		[teamId, userId, 4]);

	return result.rows[0].count !== 0;
}

export const getNumberOfGroupMemberWithAdminRole = async (teamId: number): Promise<number> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.team_member WHERE team_id = $1 AND permission = $2',
		[teamId, 4]);
	return parseInt(result.rows[0].count, 10);
}

export const getGroupMembers = async (group: IGroup): Promise<IGroupMember[]> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.group.id AS "groupId", grafanadb.user.id AS "userId", grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					INNER JOIN grafanadb.group ON grafanadb.group.team_id = grafanadb.team_member.team_id
					WHERE grafanadb.team_member.team_id = $1
					ORDER BY grafanadb.user.id ASC`;
	const result = await pool.query(query, [group.teamId]);
	result.rows.forEach(member => member.roleInGroup = permissionCodes[member.roleInGroup]);
	return result.rows as IGroupMember[];
};

export const getGroupMembersInTeamIdArray = async (teamIdsArray: number[]): Promise<IGroupMember[]> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.group.id AS "groupId", grafanadb.user.id AS "userId",
					grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					INNER JOIN grafanadb.group ON grafanadb.group.team_id = grafanadb.team_member.team_id
					WHERE grafanadb.team_member.team_id = ANY($1::bigint[])
					ORDER BY grafanadb.user.id ASC`;
	const result = await pool.query(query, [teamIdsArray]);
	result.rows.forEach(member => member.roleInGroup = permissionCodes[member.roleInGroup]);
	return result.rows as IGroupMember[];
};

export const getGroupMembersByEmailsArray = async (group: IGroup, emailsArray: string[]): Promise<IGroupMember[]> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.group.id AS "groupId", grafanadb.user.id AS "userId",
					grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					INNER JOIN grafanadb.group ON grafanadb.group.team_id = grafanadb.team_member.team_id
					WHERE grafanadb.team_member.team_id = $1 AND grafanadb.user.email =  ANY($2::varchar(190)[])`
	const result = await pool.query(query, [group.teamId, emailsArray]);
	result.rows.forEach(member => member.roleInGroup = permissionCodes[member.roleInGroup]);
	return result.rows as IGroupMember[];
};

export const getGroupMemberByProp = async (group: IGroup, propName: string, propValue: (string | number)): Promise<IGroupMember> => {
	const permissionCodes = ["None", "Viewer", "Editor", "None", "Admin"];
	const query = `SELECT grafanadb.group.id AS "groupId", grafanadb.user.id AS "userId",
					grafanadb.user.first_name AS "firstName",
	                grafanadb.user.surname, grafanadb.user.login, grafanadb.user.email,
					grafanadb.team_member.permission AS "roleInGroup"
					FROM grafanadb.user
					INNER JOIN grafanadb.team_member ON grafanadb.team_member.user_id = grafanadb.user.id
					INNER JOIN grafanadb.group ON grafanadb.group.team_id = grafanadb.team_member.team_id
					WHERE grafanadb.team_member.team_id = $1
					AND  grafanadb.user.${propName} = $2`
	const result = await pool.query(query, [group.teamId, propValue]);
	if (result.rows[0]) result.rows[0].roleInGroup = permissionCodes[result.rows[0].roleInGroup];
	return result.rows[0] as IGroupMember;
};

export const addMembersToGroup = async (group: IGroup, groupMembersArray: CreateGroupMemberDto[]): Promise<IMessage> => {
	const groupMembersIdArray = groupMembersArray.map(user => ({ userId: user.userId }));
	const msgArray = await grafanaApi.addTeamMembers(group.orgId, group.teamId, groupMembersIdArray);
	const groupMembersAddedArray: CreateGroupMemberDto[] = []
	msgArray.forEach((msg, index) => {
		if (msg === "Member added to Team") groupMembersAddedArray.push(groupMembersArray[index]);
	})
	await teamMembersPermissions(group.teamId, groupMembersAddedArray);
	await setFolderPermissionsForNewAddedMember(group, groupMembersAddedArray);

	const notificatonSettings = await getNotificationChannelSettings(group.emailNotificationChannelId);
	const oldNotificationEmailSettings = JSON.parse(notificatonSettings.settings) as IEmailNotificationChannelSettings;
	let oldAddressesArray = oldNotificationEmailSettings.addresses.split(";");
	oldAddressesArray = oldAddressesArray.filter(address => address !== "");
	const newAddressArray = [...oldAddressesArray];
	groupMembersAddedArray.forEach(member => {
		if (newAddressArray.includes(member.email) === false) newAddressArray.push(member.email);
	});
	const newAddressString = newAddressArray.join(";");
	const newSettings = { ...oldNotificationEmailSettings, addresses: newAddressString };
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

export const removeMembersInGroupsArray = async (groupsArray: IGroup[], groupMembersToRemove: IGroupMember[]): Promise<IMessage[]> => {
	const queriesArray = [];
	for (let i = 0; i < groupsArray.length; i++) {
		queriesArray[i] = removeMembersInGroup(groupsArray[i], groupMembersToRemove);
	}

	return await Promise.all(queriesArray)
		.then(messages => messages)
}

export const removeMembersInGroup = async (group: IGroup, groupMembersToRemove: IGroupMember[]): Promise<IMessage> => {
	if (groupMembersToRemove.length === 0) return { message: "All non admin members has been already removed of the group" };
	const groupMembersToRemoveFolderPermissions: CreateGroupMemberDto[] = [];
	for (const groupMember of groupMembersToRemove) {
		if (groupMember.roleInGroup === "Admin" || groupMember.roleInGroup === "Editor") {
			groupMembersToRemoveFolderPermissions.push(groupMember);
		}
	}

	if (groupMembersToRemoveFolderPermissions.length !== 0) {
		await removeFolderPermissionsForMemberArray(group, groupMembersToRemoveFolderPermissions)
	}

	const memberIdsArray = groupMembersToRemove.map(member => member.userId);
	const msgArray = await grafanaApi.removeMembersFromTeam(group.orgId, group.teamId, memberIdsArray);
	let numGroupMembersRemoved = 0;
	msgArray.forEach(msg => {
		if (msg.message === "Team Member removed") numGroupMembersRemoved++;
	});
	await sendRemoveGroupInformationEmail(group, groupMembersToRemove);

	const memberToRemoveEmailsArray = groupMembersToRemove.map(member => member.email);
	const notificatonSettings = await getNotificationChannelSettings(group.emailNotificationChannelId);
	const oldNotificationEmailSettings = JSON.parse(notificatonSettings.settings) as IEmailNotificationChannelSettings;
	const oldAddressesArray = oldNotificationEmailSettings.addresses.split(";");
	const newEmailsArray = oldAddressesArray.filter(email => memberToRemoveEmailsArray.indexOf(email) === -1 && email !== "");
	const newAddress = newEmailsArray.join(";");
	const newSettings = { ...oldNotificationEmailSettings, addresses: newAddress };
	await updateNotificationChannelSettings(group.emailNotificationChannelId, newSettings);

	let message: string;
	if (numGroupMembersRemoved === 0) message = "No one member has been removed of the group";
	else if (numGroupMembersRemoved === 1) message = "Has been removed one member of the group";
	else if (numGroupMembersRemoved > 1) message = `Have been removed ${numGroupMembersRemoved} member of the group`;
	return { message };
};

export const cleanEmailNotificationChannelForGroup = async (userEmail: string, group: IGroup): Promise<void> => {
	const notificatonSettings = await getNotificationChannelSettings(group.emailNotificationChannelId);
	const oldNotificationEmailSettings = JSON.parse(notificatonSettings.settings) as IEmailNotificationChannelSettings;
	const oldAddressArray = oldNotificationEmailSettings.addresses.split(";");
	const newEmailsArray = oldAddressArray.filter(email => email !== userEmail && email !== "");
	const newAddress = newEmailsArray.join(";");
	const newSettings = { ...oldNotificationEmailSettings, addresses: newAddress };
	await updateNotificationChannelSettings(group.emailNotificationChannelId, newSettings);
}

export const cleanEmailNotificationChannelForGroupsArray = async (userEmail: string, groupsArray: IGroup[]): Promise<void> => {
	const queriesArray = [];
	for (let i = 0; i < groupsArray.length; i++) {
		queriesArray[i] = cleanEmailNotificationChannelForGroup(userEmail, groupsArray[i]);
	}

	await Promise.all(queriesArray);
}

export const createAllViews = async (groups: IGroup[], viewsNames: string[]): Promise<void> => {
	const queriesArray = [];
	for (const group of groups) {
		const tableName = `table_${group.groupUid}`;
		if (viewsNames.indexOf(tableName) === -1) {
			const query = createView(group);
			queriesArray.push(query);
		}
	}
	await Promise.all(queriesArray);
}

export const updateMqttPasswordOfGroupById = async (groupId: number, newMqttPassword: string): Promise<void> => {
	const iterations = 10000;

	const response = await pool.query(`SELECT grafanadb.group.mqtt_salt AS "mqttSalt"
	                                FROM grafanadb.group WHERE grafanadb.group.id = $1`, [groupId]);
	const mqttSalt = response.rows[0].mqttSalt;
	const mqttPasswordHashed = crypto.pbkdf2Sync(newMqttPassword, mqttSalt, iterations, 50, 'sha256').toString('hex');
	const query = `UPDATE grafanadb.group SET mqtt_password = $1, updated = NOW()
				WHERE grafanadb.group.id = $2;`;
	await pool.query(query, [mqttPasswordHashed, groupId]);
};


