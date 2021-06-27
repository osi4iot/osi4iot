import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinUpdate from "./digitalTwinUpdate.interface";


export const demoDigitalTwinName =  (group: IGroup, deviceType: string): string => {
	let digitalTwinName: string;
	if (deviceType === "Mobile") digitalTwinName = `${group.acronym.replace(/ /g, "_")}_mobile_default_DT`;
	else digitalTwinName = `${group.acronym.replace(/ /g, "_")}_generic_default_DT`;
	return digitalTwinName;
}

export const insertDigitalTwin = async (digitalTwinData: IDigitalTwinUpdate): Promise<IDigitalTwinUpdate> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin (device_id,
					name, description, type, url, created, updated)
					VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", name, description,
					type, url, created, updated`,
		[
			digitalTwinData.deviceId,
			digitalTwinData.name,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.url
		]);
	return result.rows[0];
};

export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: IDigitalTwin): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET name = $1, description = $2, type = $3,
					url = $4, updated = NOW() WHERE grafanadb.digital_twin.id = $5;`;
	const result = await pool.query(query, [
		digitalTwinData.name,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.url,
		digitalTwinId
	]);
};


export const deleteDigitalTwinById = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const createDigitalTwin = async (deviceId: number, digitalTwinInput: CreateDigitalTwinDto): Promise<IDigitalTwinUpdate> => {
	const digitalTwinUpdated: IDigitalTwinUpdate = { ...digitalTwinInput, deviceId };
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);
	return digitalTwin;
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
                                    grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
	                                grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.url,
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.url,
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.digital_twin.id ASC;`);
	return response.rows;
}

export const getNumDigitalTwins = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin;`);
	return parseInt(result.rows[0].count, 10);
}


export const getDigitalTwinsByGroupId = async (groupId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.url,
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.digital_twin.id ASC`, [groupId]);
	return response.rows;
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.url,
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.digital_twin.id ASC`, [groupsIdArray]);
	return response.rows;
};


export const getNumDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getDigitalTwinsByOrgId = async (orgId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.url,
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.digital_twin.id ASC`, [orgId]);
	return response.rows;
};
