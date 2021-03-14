import pool from "../../config/dbconfig";
import CreateOrganizationDto from "./organization.dto";
import IOrganization from "./organization.interface";
import grafanaApi from "../../GrafanaApi";
import { decrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";

export const exitsOrganizationWithName = async (orgName: string): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org WHERE name = $1',
		[orgName]);
	return result.rows[0].count !== "0";
};

export const exitsOrganizationWithAcronym = async (orgAcronym: string): Promise<boolean> => {
	const result = await pool.query('SELECT COUNT(*) FROM grafanadb.org WHERE acronym = $1',
		[orgAcronym]);
	return result.rows[0].count !== "0";
};


export const updateOrganizationById = async (orgId: number, orgData: CreateOrganizationDto): Promise<void> => {
	await pool.query('UPDATE grafanadb.org SET acronym = $1, address1 = $2,  city = $3, zip_code = $4, state = $5, country = $6 WHERE id = $7',
		[orgData.acronym, orgData.address, orgData.city, orgData.zipCode, orgData.state, orgData.country, orgId]);
};

export const updateOrganizationByProp = async (propName: string, propValue: (string | number), orgData: CreateOrganizationDto): Promise<void> => {
	const query = `UPDATE grafanadb.org SET name = $1, acronym = $2, address1 = $3,  city = $4, zip_code = $5, state = $6, country = $7  WHERE ${propName} = $8;`;
	const queryArray = [orgData.name, orgData.acronym, orgData.address, orgData.city, orgData.zipCode, orgData.state, orgData.country, propValue];
	await pool.query(query, queryArray);
}

export const getApiKeyIdByName = async (apiKeyName: string): Promise<number> => {
	const result = await pool.query(`SELECT id FROM grafanadb.api_key WHERE name = $1`,
		[apiKeyName]);
	return result.rows[0].id;
}

export const insertOrganizationToken = async (orgId: number, apiKeyId: number, hashedApiKey: string): Promise<void> => {
	await pool.query(`INSERT INTO grafanadb.org_token (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`,
		[orgId, apiKeyId, hashedApiKey]);
};

export const getOrganizations = async (): Promise<IOrganization[]> => {
	const query = `SELECT id, org.name, acronym, address1 as address, city, grafanadb.org.zip_code as "zipCode", state, country
					FROM grafanadb.org
					ORDER BY id ASC;`;
	const result = await pool.query(query);
	return result.rows;
}

export const getOrganizationByProp = async (propName: string, propValue: (string | number)): Promise<IOrganization> => {
	const query = `SELECT id, org.name, acronym, address1 as adress, city, grafanadb.org.zip_code as "zipCode", state, country
					FROM grafanadb.org WHERE ${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0];
}

export const getOrganizationKey = async (orgId: number): Promise<string> => {
	const query = `SELECT organization_key as "orgKey"
					FROM grafanadb.org_token WHERE org_id = $1;`;
	const result = await pool.query(query, [orgId]);
	const apiKey = decrypt(result.rows[0].orgKey);
	return apiKey;
}

export const createDefaultOrgDataSource= async (orgId: number, name: string, orgKey: string): Promise<void> => {
	const query1 = `SELECT id, json_data, secure_json_data
					FROM grafanadb.data_source WHERE name = $1;`;
	const result = await pool.query(query1, [process.env.MAIN_ORGANIZATION_DATASOURCE_NAME]);
	if (result.rows.length === 0) throw new Error("Main organization default data source not found");
	const jsonData = result.rows[0].json_data;
	const secureJsonData = result.rows[0].secure_json_data;
	const message = await grafanaApi.createDataSourcePostgres(orgId, name, orgKey);
	if ((message as any).message !== "Datasource added") throw new Error("Problem creating new data source");
	const dataSourceId = (message as any).id;

	const querry2 = 'UPDATE grafanadb.data_source SET is_default = $1, read_only= $2, json_data = $3, secure_json_data = $4 WHERE id = $5';
	await pool.query(querry2, [true, true, jsonData, secureJsonData, dataSourceId]);
}

