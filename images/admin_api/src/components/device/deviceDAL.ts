import { nanoid } from "nanoid";
import crypto from 'crypto';
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDeviceDto from "./device.dto";
import IDevice from "./device.interface";
import { passwordGenerator } from "../../utils/passwordGenerator";

export const insertDevice = async (deviceData: IDevice): Promise<IDevice> => {
	const result = await pool.query(`INSERT INTO grafanadb.device (org_id, group_id,
		            device_uid, mqtt_password, mqtt_salt, mqtt_access_control, 
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
					RETURNING  id, org_id AS "orgId",  group_id AS "groupId",
					device_uid AS "deviceUid", mqtt_password AS "mqttPassword",
					mqtt_salt AS "mqttSalt",
					mqtt_access_control AS "mqttAccessControl",
					created, updated`,
	[
		deviceData.orgId,
		deviceData.groupId,
		deviceData.deviceUid,
		deviceData.mqttPassword,
		deviceData.mqttSalt,
		deviceData.mqttAccessControl
	]);
	return result.rows[0] as IDevice;
};

export const updateDeviceByProp = async (propName: string, propValue: (string | number), device: IDevice): Promise<void> => {
	const query = `UPDATE grafanadb.device SET mqtt_access_control = $1, updated = NOW()
				WHERE grafanadb.device.${propName} = $2;`;
	await pool.query(query, [
		device.mqttAccessControl,
		propValue
	]);
};

export const updateMqttPasswordOfDeviceById = async (device: IDevice, newMqttPassword: string): Promise<void> => {
	const iterations = 10000;

	const response = await pool.query(`SELECT grafanadb.device.mqtt_salt AS "mqttSalt"
	                                FROM grafanadb.device WHERE grafanadb.device.id = $1`, [device.id]);
	const mqttSalt = response.rows[0].mqttSalt;
	const mqttPasswordHashed = crypto.pbkdf2Sync(newMqttPassword, mqttSalt, iterations, 50, 'sha256').toString('hex');
	const query = `UPDATE grafanadb.device SET mqtt_password = $1, updated = NOW()
				WHERE grafanadb.device.id = $2;`;
	await pool.query(query, [mqttPasswordHashed, device.id]);
};


export const changeDeviceUidByUid = async (device: IDevice): Promise<string> => {
	const oldDeviceUid = device.deviceUid;
	const newDeviceUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	await pool.query('UPDATE grafanadb.device SET device_uid = $1 WHERE device_uid = $2',
		[newDeviceUid, oldDeviceUid]);
	return newDeviceUid;
};

export const deleteDeviceByProp = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.device WHERE ${propName} = $1`, [propValue]);
};

export const deleteDevicesByIdArray = async (devicesId: number[]): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.device WHERE id = ANY($1::bigint[])`, [devicesId]);
};

export const createDevice = async (group: IGroup, deviceInput: CreateDeviceDto): Promise<IDevice> => {
	const deviceUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const orgId = group.orgId;
	const groupId = group.id;

	deviceInput.mqttSalt = nanoid(16).replace(/-/g, "x").replace(/_/g, "X");
	let password = deviceInput.mqttPassword;
	if (deviceInput.mqttPassword === undefined) {
		password = passwordGenerator(20);
	}
	deviceInput.mqttSalt = nanoid(16);
	const iterations = 10000;
	deviceInput.mqttPassword = crypto.pbkdf2Sync(password, deviceInput.mqttSalt, iterations, 50, 'sha256').toString('hex');
	const deviceUpdated: IDevice = { ...deviceInput, orgId, groupId, deviceUid };
	const newDevice = await insertDevice(deviceUpdated);
	return newDevice;
};

export const getDeviceByProp = async (propName: string, propValue: (string | number)): Promise<IDevice> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.${propName} = $1`, [propValue]);
	return response.rows[0] as IDevice;
}

export const getFullDeviceDataById = async (id: number): Promise<IDevice> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", 
									grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_password AS "mqttPassword", 
									grafanadb.device.mqtt_salt AS "mqttSalt",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.id = $1`, [id]);
	return response.rows[0] as IDevice;
}

export const getAllDevices = async (): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.id IS NOT NULL
									ORDER BY grafanadb.device.id  ASC;`);
	return response.rows as IDevice[];
}

export const getNumDevices = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.device;`);
	return parseInt(result.rows[0].count, 10);
}


export const getDevicesByGroupId = async (groupId: number): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.device.id  ASC`, [groupId]);
	return response.rows as IDevice[];
};

export const getDevicesByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.device.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.device.id  ASC`, [groupsIdArray]);
	return response.rows as IDevice[];
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
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.device.mqtt_access_control AS "mqttAccessControl",
									grafanadb.device.created, grafanadb.device.updated
									FROM grafanadb.device
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.device.id  ASC`, [orgId]);
	return response.rows as IDevice[];
};





