import pool from "../../config/dbconfig";
import IDatasource from "./interfaces/DataSource.interface";

export const getDataSourceByProp = async (propName: string, propValue: (string | number)): Promise<IDatasource> => {
	const propNameList = ["id", "name"];
	if (propNameList.indexOf(propName) === -1) throw new Error("Datasource propName invalid");
	const query = `SELECT id, org_id AS "orgId", version, type, name, access, url, password,
				user, database, basic_auth AS "basicAuth", basic_auth_user AS "basicAuthUser",
				basic_auth_password AS "basicAuthPassword", is_default AS "isDefault",
				json_data AS "jsonData", created, updated, with_credentials AS "withCredentials",
				secure_json_data AS "secureJsonData", read_only AS "readOnly", uid
				FROM grafanadb.data_source
				WHERE ${propName} = $1;`;
	const result = await pool.query(query, [propValue]);
	return result.rows[0] as IDatasource;
}