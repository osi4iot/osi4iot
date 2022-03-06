import process_env from "../../config/api_config";
import pool from "../../config/dbconfig";
import IDeviceMasterDevice from "./deviceMasterDevice.interface";
import CreateMasterDeviceDto from "./masterDevice.dto";
import IMasterDevice from "./masterDevice.interface";

export const getAllMasterDevices = async (): Promise<IMasterDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.master_device.id,
									grafanadb.master_device.md_hash AS "masterDeviceHash",
									grafanadb.master_device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId",
									grafanadb.device_mdevice.device_id as "deviceId"
									FROM grafanadb.master_device
									FULL JOIN grafanadb.device_mdevice ON grafanadb.device_mdevice.master_device_id = grafanadb.master_device.id
									FULL JOIN grafanadb.device ON grafanadb.device.id = grafanadb.device_mdevice.device_id
									WHERE grafanadb.master_device.id IS NOT NULL
									ORDER BY grafanadb.master_device.id ASC,
											grafanadb.master_device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.device_mdevice.device_id ASC;`);
	return response.rows;
}

export const getMasterDevicesByOrgsIdArray = async (orgsIdArray: number[]): Promise<IMasterDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.master_device.id,
									grafanadb.master_device.md_hash AS "masterDeviceHash",
									grafanadb.master_device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId",
									grafanadb.device_mdevice.device_id as "deviceId"
									FROM grafanadb.master_device
									FULL JOIN grafanadb.device_mdevice ON grafanadb.device_mdevice.master_device_id = grafanadb.master_device.id
									FULL JOIN grafanadb.device ON grafanadb.device.id = grafanadb.device_mdevice.device_id
									WHERE grafanadb.master_device.org_id = ANY($1::bigint[]) AND WHERE grafanadb.master_device.id IS NOT NULL
									ORDER BY grafanadb.master_device.id ASC,
											grafanadb.master_device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.device_mdevice.device_id ASC`, [orgsIdArray]);
	return response.rows;
};

export const getMasterDeviceByProp = async (propName: string, propValue: (string | number)): Promise<IMasterDevice> => {
	const response = await pool.query(`SELECT grafanadb.master_device.id,
									grafanadb.master_device.md_hash AS "masterDeviceHash",
									grafanadb.master_device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId",
									grafanadb.device_mdevice.device_id as "deviceId"
									FROM grafanadb.master_device
									FULL JOIN grafanadb.device_mdevice ON grafanadb.device_mdevice.master_device_id = grafanadb.master_device.id
									FULL JOIN grafanadb.device ON grafanadb.device.id = grafanadb.device_mdevice.device_id
									WHERE grafanadb.master_device.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const deleteMasterDeviceById = async (masterDeviceId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.master_device WHERE id = $1`, [masterDeviceId]);
};

export const updateMasterDeviceByProp = async (propName: string, propValue: (string | number), deviceData: CreateMasterDeviceDto): Promise<void> => {
	const query = `UPDATE grafanadb.master_device SET md_hash = $1, org_id = $2, updated = NOW()
				WHERE grafanadb.master_device.${propName} = $3;`;
	await pool.query(query, [
		deviceData.masterDeviceHash,
		deviceData.orgId,
		propValue
	]);
};

export const createMasterDevicesInOrg = async (masterDeviceHashes: string[], orgId: number): Promise<IMasterDevice[]> => {
	const masterDeviceQueries = [];
	for (let imdevice = 0; imdevice < masterDeviceHashes.length; imdevice++) {
		const masterDeviceInput: CreateMasterDeviceDto = {
			masterDeviceHash: process_env.MASTER_DEVICE_HASHES[orgId-1][imdevice],
			orgId
		}
		const masterDeviceQuery = await createMasterDevice(masterDeviceInput);
		masterDeviceQueries.push(masterDeviceQuery);
	}

	return (await Promise.all(masterDeviceQueries).then(masterDevices => masterDevices)).sort((a,b) => a.id - b.id);
};

export const createMasterDevice = async (masterDeviceInput: CreateMasterDeviceDto): Promise<IMasterDevice> => {
	const result = await pool.query(`INSERT INTO grafanadb.master_device (md_hash, org_id, created, updated)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING  id, md_hash AS "masterDeviceHash", org_id AS "orgId", created, updated`,
		[masterDeviceInput.masterDeviceHash, masterDeviceInput.orgId]);
	return result.rows[0];
};

export const createDeviceMasterDevice = async (deviceId: number, masterDeviceId: number): Promise<IDeviceMasterDevice> => {
	const result = await pool.query(`INSERT INTO grafanadb.device_mdevice (device_id, master_device_id, created, updated)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING  device_id AS "deviceId", master_device_id AS "masterDeviceId", created, updated`,
		[deviceId, masterDeviceId]);
	return result.rows[0];
};

export const deleteDeviceMasterDevice = async (deviceId: number, masterDeviceId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.device_mdevice WHERE device_id = $1 AND master_device_id = $2`, [deviceId, masterDeviceId]);
};

export const getMasterDevicesUnlinked = async (orgId: number): Promise<IMasterDevice[]> => {
	const response = await pool.query(`SELECT grafanadb.master_device.id,
									grafanadb.master_device.md_hash AS "masterDeviceHash",
									grafanadb.master_device.org_id as "orgId"
									FROM grafanadb.master_device
									LEFT JOIN grafanadb.device_mdevice ON grafanadb.device_mdevice.master_device_id = grafanadb.master_device.id
									WHERE  grafanadb.master_device.org_id = $1 AND grafanadb.device_mdevice.device_id IS NULL
									ORDER BY grafanadb.master_device.id ASC;`, [orgId]);
	return response.rows;
};
