// import pool from "../../config/dbconfig";
import { logger } from "../config/winston";
import { Pool, QueryResult } from "pg";
import grafanaApi from "../GrafanaApi"
import { encrypt } from "../utils/encryptAndDecrypt/encryptAndDecrypt";
import { createGroup, defaultOrgGroupName } from "../components/group/groupDAL";
import { FolderPermissionOption } from "../components/group/interfaces/FolerPermissionsOptions";
import { createDemoDashboards, createHomeDashboard } from "../components/group/dashboardDAL";
import { createDevice, defaultGroupDeviceName } from "../components/device/deviceDAL";
import { giveDefaultGeolocation } from "../utils/geolocation.ts/geolocation";
import IGroup from "../components/group/interfaces/Group.interface";


export async function dataBaseInitialization() {
	const pool = new Pool({
		user: process.env.POSTGRES_USER,
		host: "postgres",
		password: process.env.POSTGRES_PASSWORD,
		database: process.env.POSTGRES_DB,
		port: 5432,
	});

	const tableName1 = "grafanadb.org";
	const queryString1a = 'SELECT COUNT(*) FROM grafanadb.org WHERE name = $1';
	const parameterArray1a = ["Main Org."];
	let result0;
	try {
		result0 = await pool.query(queryString1a, parameterArray1a);
	} catch (err) {
		logger.log("error", `Table ${tableName1} can not found: %s`, err.message);
	}

	if (result0.rows[0].count !== "0") {

		const tableUser = "grafanadb.user";
		const queryStringUser = `ALTER TABLE grafanadb.user
								ADD COLUMN first_name varchar(200),
								ADD COLUMN surname varchar(200),
								ADD COLUMN telegram_id varchar(200) UNIQUE`;
		try {
			await pool.query(queryStringUser);
			logger.log("info", `Column telegram_id has been added sucessfully to Table ${tableUser}`);
		} catch (err) {
			logger.log("error", `Column telegram_id can not be added sucessfully to Table ${tableUser}: %s`, err.message);
		}

		const plaformAdminUser = {
			id: 2,
			name: `${process.env.PLATFORM_ADMIN_FIRST_NAME} ${process.env.PLATFORM_ADMIN_SURNAME}`,
			firstName: process.env.PLATFORM_ADMIN_FIRST_NAME,
			surname: process.env.PLATFORM_ADMIN_SURNAME,
			email: process.env.PLATFORM_ADMIN_EMAIL,
			login: process.env.PLATFORM_ADMIN_USER_NAME,
			password: process.env.PLATFORM_ADMIN_PASSWORD,
			telegramId: process.env.PLATFORM_ADMIN_TELEGRAM_ID,
			OrgId: 1
		}
		const grafanaAdminBasicAuthOptions = {
			username: 'admin',
			password: process.env.GRAFANA_ADMIN_PASSWORD,
			json: true
		}
		await grafanaApi.createUser(plaformAdminUser, grafanaAdminBasicAuthOptions);

		const queryString1b = 'UPDATE grafanadb.user SET first_name = $1, surname = $2, telegram_id = $3 WHERE id = $4';
		try {
			await pool.query(queryString1b,
				[
					process.env.PLATFORM_ADMIN_FIRST_NAME,
					process.env.PLATFORM_ADMIN_SURNAME,
					`${process.env.PLATFORM_ADMIN_FIRST_NAME} ${process.env.PLATFORM_ADMIN_SURNAME}`,
					2
				]);
		} catch (err) {
			logger.log("error", `Platform admin user can not be updated: %s`, err.message);
		}
		await grafanaApi.giveGrafanaAdminPermissions(2);
		await grafanaApi.changeUserRoleInOrganization(1, 2, "Admin");

		const queryString1c = `ALTER TABLE grafanadb.org
								ADD COLUMN acronym varchar(20) UNIQUE,
								ADD COLUMN geolocation POINT`;
		try {
			await pool.query(queryString1c);
			logger.log("info", `Column acronym has been added sucessfully to Table ${tableName1}`);
		} catch (err) {
			logger.log("error", `Column acronym can not be added sucessfully to Table ${tableName1}: %s`, err.message);
		}

		const queryString1d = `UPDATE grafanadb.org SET name = $1,  acronym = $2, address1 = $3, city = $4, zip_code = $5,
								state = $6, country = $7, geolocation = $8 WHERE name = $9`;
		const parameterArray1d = [
			process.env.MAIN_ORGANIZATION_NAME,
			process.env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
			process.env.MAIN_ORGANIZATION_ADDRESS1,
			process.env.MAIN_ORGANIZATION_CITY,
			process.env.MAIN_ORGANIZATION_ZIP_CODE,
			process.env.MAIN_ORGANIZATION_STATE,
			process.env.MAIN_ORGANIZATION_COUNTRY,
			giveDefaultGeolocation(),
			"Main Org."
		];
		let apiKeyMainOrg: string;

		try {
			await pool.query(queryString1d, parameterArray1d);
			const apyKeyName = `ApiKey_${process.env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase()}`
			const apiKeyData = { name: apyKeyName, role: "Admin" };
			const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
			apiKeyMainOrg = apiKeyObj.key;
			logger.log("info", `Table ${tableName1} has been updated sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableName1} can not be updated: %s`, err.message);
		}

		const tableName2 = "grafanadb.org_token";
		const queryString2a = `
			CREATE TABLE IF NOT EXISTS ${tableName2}(
				id serial PRIMARY KEY,
				org_id bigint,
				api_key_id integer,
				organization_key text,
				CONSTRAINT fk_api_key
					FOREIGN KEY(api_key_id)
						REFERENCES grafanadb.api_key(id)
						ON DELETE CASCADE,
				CONSTRAINT fk_org_id
					FOREIGN KEY(org_id)
						REFERENCES grafanadb.org(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_org_token_org_id
			ON grafanadb.org_token(org_id);`;

		try {
			await pool.query(queryString2a);
			logger.log("info", `Table ${tableName2} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableName2} can not be created: %s`, err.message);
		}

		const queryString2b = `INSERT INTO ${tableName2} (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`
		const hashedApiKey = encrypt(apiKeyMainOrg);
		const queryParameters2b = [1, 1, hashedApiKey];
		try {
			await pool.query(queryString2b, queryParameters2b);
			logger.log("info", `Data in table ${tableName2} has been inserted sucessfully`);
		} catch (err) {
			logger.log("error", `Data in table ${tableName2} con not been inserted: %s`, err.message);
		}

		let group: IGroup;
		const mainOrgGroupName = defaultOrgGroupName(process.env.MAIN_ORGANIZATION_NAME, process.env.MAIN_ORGANIZATION_ACRONYM);
		const orgAcronym = process.env.MAIN_ORGANIZATION_ACRONYM;
		const orgName = process.env.MAIN_ORGANIZATION_NAME;
		const tableName3 = "grafanadb.group";
		const queryString3a = `
			CREATE TABLE IF NOT EXISTS ${tableName3}(
				id serial PRIMARY KEY,
				org_id bigint,
				team_id bigint,
				folder_id bigint,
				folder_uid VARCHAR(40),
				name VARCHAR(190) UNIQUE,
				acronym varchar(20) UNIQUE,
				group_uid VARCHAR(42) UNIQUE,
				telegram_invitation_link VARCHAR(50),
				telegram_chatid VARCHAR(15),
				email_notification_channel_id bigint,
				telegram_notification_channel_id bigint,
				is_org_default_group BOOLEAN DEFAULT true,
				CONSTRAINT fk_org_id
					FOREIGN KEY(org_id)
						REFERENCES grafanadb.org(id)
						ON DELETE CASCADE,
				CONSTRAINT fk_team_id
					FOREIGN KEY(team_id)
						REFERENCES grafanadb.team(id)
						ON DELETE CASCADE,
				CONSTRAINT fk_folder_id
					FOREIGN KEY(folder_id)
						REFERENCES grafanadb.dashboard(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_group_org_id
			ON grafanadb.group(org_id);

			CREATE INDEX IF NOT EXISTS idx_group_name
			ON grafanadb.group(name);

			CREATE INDEX IF NOT EXISTS idx_group_group_uid
			ON grafanadb.group(group_uid);`;

		try {
			await pool.query(queryString3a);
			const mainOrgGroupAdmin = {
				id: 2,
				firstName: process.env.PLATFORM_ADMIN_FIRST_NAME,
				surname: process.env.PLATFORM_ADMIN_SURNAME,
				email: process.env.PLATFORM_ADMIN_EMAIL
			}
			const mainOrgGroupAcronym = `${process.env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase()}_GRAL`;
			const defaultMainOrgGroup = {
				name: mainOrgGroupName,
				acronym: mainOrgGroupAcronym,
				email: `${process.env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toLocaleLowerCase()}_general@test.com`,
				telegramChatId: process.env.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
				telegramInvitationLink: process.env.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
				folderPermission: ("Viewer" as FolderPermissionOption),
				groupAdminDataArray: [mainOrgGroupAdmin]
			}
			group = await createGroup(1, defaultMainOrgGroup, process.env.MAIN_ORGANIZATION_NAME, true);
			await createHomeDashboard(1, orgAcronym, orgName, group.folderId);
			logger.log("info", `Table ${tableName3} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableName3} can not be created: %s`, err.message);
		}

		const tableName4 = "grafanadb.device";
		const queryString4a = `
			CREATE TABLE IF NOT EXISTS ${tableName4}(
				id serial PRIMARY KEY,
				org_id bigint,
				group_id bigint,
				name VARCHAR(190) UNIQUE,
				description TEXT,
				device_uid VARCHAR(40) UNIQUE,
				geolocation POINT,
				is_default_group_device BOOLEAN,
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ,
				CONSTRAINT fk_org_id
					FOREIGN KEY(org_id)
						REFERENCES grafanadb.org(id)
						ON DELETE CASCADE,
				CONSTRAINT fk_group_id
					FOREIGN KEY(group_id)
						REFERENCES grafanadb.group(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_device_name
			ON grafanadb.device(name);`;

		try {
			await pool.query(queryString4a);
			logger.log("info", `Table ${tableName4} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableName4} can not be created: %s`, err.message);
		}

		const tableName5 = "iot_data.thingData";
		const queryString5a = `
			ALTER TABLE iot_data.thingData
				ADD CONSTRAINT fk_group_uid
				FOREIGN KEY(group_uid)
				REFERENCES grafanadb.group(group_uid)
					ON DELETE CASCADE
					ON UPDATE CASCADE,
				ADD CONSTRAINT fk_device_uid
				FOREIGN KEY(device_uid)
					REFERENCES grafanadb.device(device_uid)
						ON DELETE CASCADE
						ON UPDATE CASCADE;`;

		try {
			await pool.query(queryString5a);
			const defaultGroupDeviceData = {
				name: defaultGroupDeviceName(group),
				description: `Default device of the group ${mainOrgGroupName}`,
				latitude: 0,
				longitude: 0
			};
			const device = await createDevice(group, defaultGroupDeviceData, true);
			await createDemoDashboards(orgAcronym, group, device);
			logger.log("info", `Foreing key in table ${tableName5} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Foreing key in table ${tableName5} could not be created: %s`, err.message);
		}

		const tableName6 = "grafanadb.refresh_token";
		const queryString6a = `
			CREATE TABLE IF NOT EXISTS ${tableName6}(
				id serial PRIMARY KEY,
				user_id bigint,
				token TEXT UNIQUE,
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ,
				CONSTRAINT fk_user_id
					FOREIGN KEY(user_id)
						REFERENCES grafanadb.user(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_refresh_token
			ON grafanadb.refresh_token(token);`;

		try {
			await pool.query(queryString6a);
			logger.log("info", `Table ${tableName6} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableName6} can not be created: %s`, err.message);
		}

		const tableName7 = "grafanadb.alert_notification";
		const queryString7a = `
				ALTER TABLE grafanadb.alert_notification
					ADD CONSTRAINT fk_org_id
					FOREIGN KEY(org_id)
					REFERENCES grafanadb.org(id)
						ON DELETE CASCADE;`;

		try {
			await pool.query(queryString7a);
			logger.log("info", `Foreing key in table ${tableName7} has been added sucessfully`);
		} catch (err) {
			logger.log("error", `Foreing key in table ${tableName7} couldd not be added: %s`, err.message);
		}

		pool.end(() => {
			logger.log("info", `Migration pool has ended`);
		})
	}
}
