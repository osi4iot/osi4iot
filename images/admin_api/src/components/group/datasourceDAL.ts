import pool from "../../config/dbconfig";
import timescaledb_pool from "../../config/timescaledb_config";
import grafanaApi from "../../GrafanaApi";
import IMessage from "../../GrafanaApi/interfaces/Message";
import { passwordGenerator } from "../../utils/passwordGenerator";
import { getOrganizationKey } from "../organization/organizationDAL";
import IDataSource from "./interfaces/DataSource.interface";

export const generateGrafanaDataSourceName = (orgId: number, dataSourceType: string) => {
	const dataSourceName = `${dataSourceType}_org_${orgId}`;
	return dataSourceName;
}

export const generateGrafanaDataSourceUser = (orgId: number) => {
	const dataSourceUser = `data_source_user_org_${orgId}`;
	return dataSourceUser;
}

const exitUserInTimescaledb = async (userName: string): Promise<boolean> => {
	const result = await timescaledb_pool.query(`SELECT FROM pg_catalog.pg_roles WHERE rolname = $1;`, [userName]);
	return result.rows.length !== 0;
}


export const createTimescaledbOrgDataSource = async (orgId: number, orgKey?: string): Promise<void> => {
	if (orgKey === undefined) {
		orgKey = await getOrganizationKey(orgId);
	}
	const dataSourceUser = generateGrafanaDataSourceUser(orgId);
	const existUser = await exitUserInTimescaledb(dataSourceUser);
	const password = passwordGenerator(20);
	if (!existUser) {
		const query1 = `CREATE USER ${dataSourceUser} WITH PASSWORD '${password}';`;
		await timescaledb_pool.query(query1);

		const query2 = `GRANT CONNECT ON DATABASE iot_data_db TO ${dataSourceUser};`;
		await timescaledb_pool.query(query2);

		const query3 = `GRANT USAGE ON SCHEMA iot_datasource TO ${dataSourceUser};`;
		await timescaledb_pool.query(query3);
	}

	const dataSourceName = generateGrafanaDataSourceName(orgId, "timescaledb");
	const response = await grafanaApi.getDataSourceByName(dataSourceName, orgKey);
	if ((response as IMessage).message !== undefined && (response as IMessage).message === "Data source not found") {
		const message = await grafanaApi.createDataSourceTimescaledb(orgId, dataSourceName, dataSourceUser, password, orgKey);
		if (message.message !== "Datasource added") throw new Error("Problem creating new data source");
		const dataSourceId = message.id;
		const query4 = 'UPDATE grafanadb.data_source SET read_only= $1 WHERE id = $2';
		await pool.query(query4, [true, dataSourceId]);
	} else {
		const dataSource = response as IDataSource;
		await pool.query('UPDATE grafanadb.data_source SET read_only= $1 WHERE id = $2', [false, dataSource.id]);
		await grafanaApi.updateDataSourceimescaledb(dataSource, password, orgKey);
		await pool.query('UPDATE grafanadb.data_source SET read_only= $1 WHERE id = $2', [true, dataSource.id]);
	}
}