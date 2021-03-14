import { v4 as uuidv4 } from "uuid";
import pool from "../../config/dbconfig";
import grafanaApi from "../../GrafanaApi";
import { getOrganizationKey } from "../organization/organizationDAL";
import CreateGroupDto from "./group.dto";
import IGroup from "./Group.interface";


export const createGroup = async (orgId: number, groupInput: CreateGroupDto, isPrivate: boolean = true): Promise<IGroup> => {
	let group: IGroup;
	const groupUid = uuidv4().replace(/-/g, "_");
	if (!groupInput.telegramInvitationLink) groupInput.telegramInvitationLink = "";
	if (!groupInput.telegramChatId) groupInput.telegramChatId = "";
	if (!groupInput.email) groupInput.email = "";
	const teamData = { ...groupInput, orgId };
	const orgKey = await getOrganizationKey(orgId);
	const team = await grafanaApi.createTeam(teamData);
	const folderData = { title: groupInput.name, email: groupInput.email };
	const folder = await grafanaApi.createFolder(folderData, orgKey);
	const teamId = team.teamId;
	const folderId = folder.id;
	const folderUid = folder.uid;
	group = {
		orgId,
		teamId,
		folderId,
		folderUid,
		name: groupInput.name,
		acronym: groupInput.acronym,
		groupUid,
		telegramInvitationLink: groupInput.telegramInvitationLink,
		telegramChatId: groupInput.telegramInvitationLink,
		isPrivate
	}

	await createView(groupUid);
	await insertGroup(group);
	return group;
}

export const getAllGroupsInOrganization = async (orgId: number): Promise<IGroup[]> => {
	const query = `SELECT id, org_id AS "orgId", team_id AS "teamId", folder_id AS  "folderId",
	        		name, acronym, group_uid AS  "groupUid",
					telegram_invitation_link AS "telegramInvitationLink",
					telegram_chatid AS "telegramChatId",
					is_private AS "isPrivate"
					FROM grafanadb.group
					WHERE org_id = $1
					ORDER BY id ASC;`;
	const result = await pool.query(query,[orgId]);
	return result.rows;
}

export const getGroupByProp = async (propName: string, propValue: (string | number)): Promise<IGroup> => {
	const query = `SELECT id, org_id AS "orgId", team_id AS "teamId",
					folder_id AS  "folderId", folder_uid AS  "folderUid",
	        		name, acronym, group_uid AS  "groupUid",
					telegram_invitation_link AS "telegramInvitationLink",
					telegram_chatid AS "telegramChatId",
					is_private AS "isPrivate"
					FROM grafanadb.group
					WHERE ${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0];
}

export const insertGroup = async (group: IGroup): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.group (org_id, team_id, folder_id,
					folder_uid, name, acronym, group_uid,
					telegram_invitation_link, telegram_chatid, is_private)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
			group.isPrivate
		]);
};

export const createView = async (groupUid: string): Promise<void> => {
	const viewName = `Table_${groupUid}`;
	const groupId = `Group_${groupUid}`;
	await pool.query(`CREATE VIEW iot_datasource.${viewName} AS SELECT timestamp, topic, payload FROM iot_data.thingData WHERE group_id = '${groupId}'`);
};

export const deleteView = async (groupUid: string): Promise<void> => {
	const viewName = `Table_${groupUid}`;
	await pool.query(`DROP VIEW iot_datasource.${viewName}`);
};

export const changeGroupUidByUid = async (newGroupUid: string, oldGroupUid: string): Promise<void> => {
	await pool.query('UPDATE grafanadb.group SET group_uid = $1 WHERE group_uid = $2',
		[newGroupUid, oldGroupUid]);
	await deleteView(oldGroupUid);
};

export const deleteGroup = async (groupData: IGroup, orgKey: string): Promise<void> => {
	await pool.query('DELETE FROM grafanadb.group WHERE id = $1', [groupData.id]);
	await grafanaApi.deleteFolderByUid(groupData.folderUid, orgKey);
	await grafanaApi.deleteTeamById(groupData.teamId);
	await deleteView(groupData.groupUid);
};

export const deleteGroupByName = async (groupName: string, orgKey: string): Promise<void> => {
	const group = await getGroupByProp("name", groupName);
	await pool.query('DELETE FROM grafanadb.group WHERE id = $1', [group.id]);
	await grafanaApi.deleteFolderByUid(group.folderUid, orgKey);
	await grafanaApi.deleteTeamById(group.teamId);
	await deleteView(group.groupUid);
};


