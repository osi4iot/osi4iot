import pool from "../../config/dbconfig";
import { IBucketFileInfoList } from "../digitalTwin/digitalTwinDAL";
import IGroup from "../group/interfaces/Group.interface";
import CreateMLModelDto from "./ml_model.dto";
import IMLModel from "./ml_model.interface";

export const insertMLModel = async (mlModelData: IMLModel): Promise<IMLModel> => {
	const result = await pool.query(`INSERT INTO grafanadb.ml_model(group_id, ml_model_uid,
		            description, ml_library, created, updated)
					VALUES ($1, $2, $3, $4, NOW(), NOW())
					RETURNING  id, group_id AS "groupId", ml_model_uid AS "mlModelUid",
					description, ml_library AS "mlLibrary", created, updated`,
	[
		mlModelData.groupId,
		mlModelData.mlModelUid,
		mlModelData.description,
		mlModelData.mlLibrary,
	]);
	return result.rows[0] as IMLModel;
};

export const updateMLModelByProp = async (propName: string, propValue: (string | number), mlModel: IMLModel): Promise<void> => {
	const query = `UPDATE grafanadb.ml_model SET description = $1, mlLibrary =$2, updated = NOW()
				WHERE grafanadb.ml_model.${propName} = $3;`;
	await pool.query(query, [
		mlModel.description,
		mlModel.mlLibrary,
		propValue
	]);
};

export const deleteMLModelByProp = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.ml_model WHERE ${propName} = $1`, [propValue]);
};

export const createMLModel = async (group: IGroup, mlModelInput:CreateMLModelDto): Promise<IMLModel> => {
	const groupId = group.id;
	const mlModelUpdated: IMLModel = { ...mlModelInput, groupId };
	const newMlModel = await insertMLModel(mlModelUpdated);
	return newMlModel;
};

export const getMLModelByProp = async (propName: string, propValue: (string | number)): Promise<IMLModel> => {
	const response = await pool.query(`SELECT grafanadb.ml_model.id, grafanadb.group.org_id AS "orgId",
									grafanadb.ml_model.group_id AS "groupId", grafanadb.ml_model.description,
									grafanadb.ml_model.ml_model_uid AS "mlModelUid",
									grafanadb.ml_model.ml_library AS "mlLibrary",
									grafanadb.ml_model.created, grafanadb.ml_model.updated
									FROM grafanadb.ml_model
									INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.ml_model.${propName} = $1`, [propValue]);
	return response.rows[0] as IMLModel;
}


export const getAllMLModels = async (): Promise<IMLModel[]> => {
	const response = await pool.query(`SELECT grafanadb.ml_model.id, grafanadb.group.org_id AS "orgId",
                                    grafanadb.ml_model.group_id AS "groupId", grafanadb.ml_model.description,
									grafanadb.ml_model.ml_model_uid AS "mlModelUid",
									grafanadb.ml_model.ml_library AS "mlLibrary",
                                    grafanadb.ml_model.created, grafanadb.ml_model.updated
                                    FROM grafanadb.ml_model
                                    INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.ml_model.id IS NOT NULL
									ORDER BY grafanadb.ml_model.id  ASC;`);
	return response.rows as IMLModel[];
}

export const getNumMLModels = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.ml_model;`);
	return parseInt(result.rows[0].count, 10);
}

export const getMLModelsByGroupId = async (groupId: number): Promise<IMLModel[]> => {
	const response = await pool.query(`SELECT grafanadb.ml_model.id, grafanadb.group.org_id AS "orgId",
                                    grafanadb.ml_model.group_id AS "groupId", grafanadb.ml_model.description,
									grafanadb.ml_model.ml_model_uid AS "mlModelUid",
									grafanadb.ml_model.ml_library AS "mlLibrary",
                                    grafanadb.ml_model.created, grafanadb.ml_model.updated
                                    FROM grafanadb.ml_model
                                    INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.ml_model.group_id = $1
									ORDER BY grafanadb.ml_model.id  ASC`, [groupId]);
	return response.rows as IMLModel[];
};

export const getMLModelsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IMLModel[]> => {
	const response = await pool.query(`SELECT grafanadb.ml_model.id, grafanadb.group.org_id AS "orgId",
                                    grafanadb.ml_model.group_id AS "groupId", grafanadb.ml_model.description,
									grafanadb.ml_model.ml_model_uid AS "mlModelUid",
									grafanadb.ml_model.ml_library AS "mlLibrary",
                                    grafanadb.ml_model.created, grafanadb.ml_model.updated
                                    FROM grafanadb.ml_model
                                    INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.ml_model.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.ml_model.id  ASC`, [groupsIdArray]);
	return response.rows as IMLModel[];
};


export const getNumMLModelsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.ml_model
									INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.ml_model.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getMLModelsByOrgId = async (orgId: number): Promise<IMLModel[]> => {
	const response = await pool.query(`SELECT grafanadb.ml_model.id, grafanadb.group.org_id AS "orgId",
                                    grafanadb.ml_model.group_id AS "groupId", grafanadb.ml_model.description,
									grafanadb.ml_model.ml_model_uid AS "mlModelUid",
									grafanadb.ml_model.ml_library AS "mlLibrary",
                                    grafanadb.ml_model.created, grafanadb.ml_model.updated
                                    FROM grafanadb.ml_model
                                    INNER JOIN grafanadb.group ON grafanadb.ml_model.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.ml_model.id  ASC`, [orgId]);
	return response.rows as IMLModel[];
};

export interface IBucketMlModelFileInfoList {
	mlModelId: number;
	fileInfoList: IBucketFileInfoList[]
}