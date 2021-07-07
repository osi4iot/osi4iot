import pool from "../../config/dbconfig";
import CreateBuildingDto from "./building.dto";
import IBuiliding from "./building.interface";
import CreateFloorDto from "./floor.dto";
import IFloor from "./floor.interface";

export const createBuilding = async (buildingInput: CreateBuildingDto): Promise<IBuiliding> => {
	const result = await pool.query(`INSERT INTO grafanadb.building (name, geodata, geolocation, created, updated)
        VALUES ($1, $2, $3,  NOW(), NOW())
        RETURNING  id, name, geodata AS "geoJsonData",
        geolocation[0] AS longitude, geolocation[0] AS latitude,
        created, updated`,
		[
			buildingInput.name,
			buildingInput.geoJsonData,
			`(${buildingInput.longitude},${buildingInput.latitude})`
		]);
	return result.rows[0];
};

export const getBuildingByProp = async (propName: string, propValue: (string | number)): Promise<IBuiliding> => {
	const response = await pool.query(`SELECT id, name, geodata AS "geoJsonData",
									geolocation[0] AS longitude, geolocation[1] AS latitude,
									AGE(NOW(), created) AS "timeFromCreation",
									AGE(NOW(), updated) AS "timeFromLastUpdate"
									FROM grafanadb.building
									WHERE grafanadb.building.${propName} = $1`, [propValue]);
	return response.rows[0];
};

export const getFloorByBuildingIdAndFloorNumber = async (buildingId: number, floorNumber: number): Promise<IFloor> => {
	const response = await pool.query(`SELECT grafanadb.floor.id, grafanadb.floor.building_id AS "buildingId",
									grafanadb.building.name AS "buildingName",
									grafanadb.floor.floor_number AS "floorNumber",
									grafanadb.floor.geodata AS "geoJsonData",
									AGE(NOW(), grafanadb.floor.created) AS "timeFromCreation",
									AGE(NOW(), grafanadb.floor.updated) AS "timeFromLastUpdate"
									FROM grafanadb.floor
									INNER JOIN grafanadb.building ON grafanadb.building.id = grafanadb.floor.building_id
									WHERE building_id = $1 AND floor_number = $2`, [buildingId, floorNumber]);
	return response.rows[0];
};

export const getFloorById = async (floorId: number): Promise<IFloor> => {
	const response = await pool.query(`SELECT id, building_id AS "buildingId", floor_number AS "floorNumber",
									geodata AS "geoJsonData",
									AGE(NOW(), created) AS "timeFromCreation",
									AGE(NOW(), updated) AS "timeFromLastUpdate"
									FROM grafanadb.floor
									WHERE id = $1`, [floorId]);
	return response.rows[0];
};

export const createFloor = async (FloorInput: CreateFloorDto): Promise<IFloor> => {
	const result = await pool.query(`INSERT INTO grafanadb.floor (building_id, floor_number, geodata, created, updated)
        VALUES ($1, $2, $3,  NOW(), NOW())
        RETURNING  id, building_id AS "buildingId", floor_number AS "floorNumber", geodata AS "geoJsonData",
        created, updated`,
		[
			FloorInput.buildingId,
			FloorInput.floorNumber,
			FloorInput.geoJsonData
		]);
	return result.rows[0];
};

export const deleteBuildingById = async (buildingId: number): Promise<IBuiliding> => {
	const response = await pool.query(`DELETE FROM grafanadb.building WHERE id = $1 RETURNING *`, [buildingId]);
	return response.rows[0];
};

export const deleteFloorById = async (floorId: number): Promise<IFloor> => {
	const response = await pool.query(`DELETE FROM grafanadb.floor WHERE id = $1 RETURNING *`, [floorId]);
	return response.rows[0];
};

export const updateBuildingById = async (buildingId: number, building: IBuiliding): Promise<IBuiliding> => {
	const query = `UPDATE grafanadb.building SET name = $1, geodata= $2,
				geolocation = $3, updated = NOW()
				WHERE id = $4
				RETURNING *;`;
	const response = await pool.query(query, [
		building.name,
		building.geoJsonData,
		`(${building.longitude},${building.latitude})`,
		buildingId
	]);
	return response.rows[0];
};

export const updateFloorById = async (floorId: number, floor: IFloor): Promise<IFloor> => {
	const query = `UPDATE grafanadb.floor SET building_id = $1,
				floor_number = $2, geodata= $3, updated = NOW()
				WHERE id = $4
				RETURNING *;`;
	const response = await pool.query(query, [
		floor.buildingId,
		floor.floorNumber,
		floor.geoJsonData,
		floorId
	]);
	return response.rows[0];
};

export const getAllBuildings = async (): Promise<IBuiliding[]> => {
	const response = await pool.query(`SELECT id, name,
									geolocation[0] AS longitude, geolocation[1] AS latitude,
									geodata AS "geoJsonData",
									AGE(NOW(), created) AS "timeFromCreation",
									AGE(NOW(), updated) AS "timeFromLastUpdate"
									FROM grafanadb.building
									ORDER BY id ASC;`);
	return response.rows;
};

export const getBuildingsFromOrgIdArray = async (orgIdArray: number[]): Promise<IBuiliding[]> => {
	const response = await pool.query(`SELECT DISTINCT grafanadb.building.id, grafanadb.building.name,
									grafanadb.building.geodata AS "geoJsonData",
									grafanadb.building.geolocation[0] AS longitude, grafanadb.building.geolocation[1] AS latitude,
									grafanadb.building.created, grafanadb.building.updated
									AGE(NOW(), created) AS "timeFromCreation",
									AGE(NOW(), updated) AS "timeFromLastUpdate"
									FROM grafanadb.building
									INNER JOIN grafanadb.org ON grafanadb.org.building_id = grafanadb.building.id
									WHERE grafanadb.org.id = ANY($1::integer[])
									ORDER BY id ASC;`, [orgIdArray]);
	return response.rows;
};

export const getAllFloors = async (): Promise<IFloor[]> => {
	const response = await pool.query(`SELECT grafanadb.floor.id, grafanadb.floor.building_id AS "buildingId",
									grafanadb.building.name AS "buildingName",
									grafanadb.floor.floor_number AS "floorNumber",
									grafanadb.floor.geodata AS "geoJsonData",
									AGE(NOW(), grafanadb.floor.created) AS "timeFromCreation",
									AGE(NOW(), grafanadb.floor.updated) AS "timeFromLastUpdate"
									FROM grafanadb.floor
									INNER JOIN grafanadb.building ON grafanadb.building.id = grafanadb.floor.building_id
									ORDER BY grafanadb.floor.id ASC,
											grafanadb.floor.building_id ASC,
											grafanadb.floor.floor_number ASC;`);
	return response.rows;
};

export const getAllFloorsFromOrgIdArray = async (orgIdArray: number[]): Promise<IFloor[]> => {
	const response = await pool.query(`SELECT DISTINCT grafanadb.floor.id,
									grafanadb.floor.building_id AS "buildingId",
									grafanadb.building.name AS "buildingName",
									grafanadb.floor.floor_number AS "floorNumber",
									grafanadb.floor.geodata AS "geoJsonData",
									AGE(NOW(), created) AS "timeFromCreation",
									AGE(NOW(), updated) AS "timeFromLastUpdate"
									FROM grafanadb.floor
									INNER JOIN grafanadb.building ON grafanadb.building.id = grafanadb.floor.building_id
									INNER JOIN grafanadb.org ON grafanadb.org.building_id = grafanadb.building.id
									WHERE grafanadb.org.id = ANY($1::integer[])
									ORDER BY grafanadb.floor.id ASC,
											grafanadb.floor.building_id ASC,
											grafanadb.floor.floor_number ASC;`, [orgIdArray]);
	return response.rows;
};