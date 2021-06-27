import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDeviceDto from "./device.dto";
import IDevice from "./device.interface";

export const defaultGroupDeviceName = (group: IGroup, type: string): string => {
	let deviceName: string;
	if (type === "Mobile") deviceName = `${group.acronym.replace(/ /g, "_")}_mobile_default`;
	else deviceName = `${group.acronym.replace(/ /g, "_")}_generic_default`;
	return deviceName;
}


export const insertDevice = async (deviceData: IDevice): Promise<IDevice> => {
	const result = await pool.query(`INSERT INTO grafanadb.device (org_id, group_id, name, description,
					device_uid, geolocation, type, created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
					RETURNING  id, org_id AS "orgId",  group_id AS "groupId",
					device_uid AS "deviceUid", geolocation[0] AS longitude,
					geolocation[0] AS latitude, type,
					created, updated`,
		[
			deviceData.orgId,
			deviceData.groupId,
			deviceData.name,
			deviceData.description,
			deviceData.deviceUid,
			`(${deviceData.longitude},${deviceData.latitude})`,
			deviceData.type
		]);
	return result.rows[0];
};

export const updateDeviceByProp = async (propName: string, propValue: (string | number), device: IDevice): Promise<void> => {
	const query = `UPDATE grafanadb.device SET name = $1, description = $2,
				geolocation = $3, type = $4, updated = NOW()
				WHERE grafanadb.device.${propName} = $5;`;
	const result = await pool.query(query, [
		device.name,
		device.description,
		`(${device.longitude},${device.latitude})`,
		device.type,
		propValue
	]);
};

export const changeDeviceUidByUid = async (device: IDevice): Promise<string> => {
	const oldDeviceUid = device.deviceUid;
	const newDeviceUid = nanoid().replace(/-/g, "x");
	await pool.query('UPDATE grafanadb.device SET device_uid = $1 WHERE device_uid = $2',
		[newDeviceUid, oldDeviceUid]);
	return newDeviceUid;
};

export const deleteDeviceByProp = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.device WHERE ${propName} = $1`, [propValue]);
};

export const createDevice =  async (group: IGroup, deviceInput: CreateDeviceDto): Promise<IDevice> => {
	const deviceUid = nanoid().replace(/-/g, "x");
	const orgId = group.orgId;
	const groupId = group.id;
	const deviceUpdated: IDevice = {...deviceInput, orgId, groupId, deviceUid};
	const device = await insertDevice(deviceUpdated);
	return device;
};

export const getDeviceByProp = async (propName: string, propValue: (string | number)): Promise<IDevice> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
	                                grafanadb.device.name, grafanadb.device.description,
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid", grafanadb.device.geolocation[0] AS longitude,
									grafanadb.device.geolocation[1] AS latitude, grafanadb.device.type,
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getAllDevices = async (): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
	                                grafanadb.device.name, grafanadb.device.description,
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid", grafanadb.device.geolocation[0] AS longitude,
									grafanadb.device.geolocation[1] AS latitude, grafanadb.device.type,
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									ORDER BY grafanadb.device.id  ASC;`);
	return response.rows;
}

export const getNumDevices = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.device;`);
	return parseInt(result.rows[0].count, 10);
}


export const getDevicesByGroupId = async (groupId: number): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.name, grafanadb.device.description,
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid", grafanadb.device.geolocation[0] AS longitude,
									grafanadb.device.geolocation[1] AS latitude, grafanadb.device.type,
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.group_id = $1`, [groupId]);
	return response.rows;
};

export const getDevicesByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.name, grafanadb.device.description,
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid", grafanadb.device.geolocation[0] AS longitude,
									grafanadb.device.geolocation[1] AS latitude, grafanadb.device.type,
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return response.rows;
};


export const getNumDevicesByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getDevicesByOrgId = async (orgId: number): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid", grafanadb.device.geolocation[0] AS longitude,
									grafanadb.device.geolocation[1] AS latitude, grafanadb.device.type,
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.org_id = $1`, [orgId]);
	return response.rows;
};




