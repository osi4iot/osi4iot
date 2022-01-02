// import pool from "../../config/dbconfig";
import { logger } from "../config/winston";
import { Pool, QueryResult } from "pg";
import grafanaApi from "../GrafanaApi"
import { encrypt } from "../utils/encryptAndDecrypt/encryptAndDecrypt";
import { addMembersToGroup, createGroup, defaultOrgGroupName } from "../components/group/groupDAL";
import { FolderPermissionOption } from "../components/group/interfaces/FolerPermissionsOptions";
import { createDemoDashboards, createHomeDashboard } from "../components/group/dashboardDAL";
import { createDevice, defaultGroupDeviceName } from "../components/device/deviceDAL";
import IGroup from "../components/group/interfaces/Group.interface";
import { RoleInGroupOption } from "../components/group/interfaces/RoleInGroupOptions";
import { createTopic, demoTopicName } from "../components/topic/topicDAL";
import { createDigitalTwin, demoDigitalTwinName } from "../components/digitalTwin/digitalTwinDAL";
import process_env from "../config/api_config";


export async function dataBaseInitialization() {
	const pool = new Pool({
		user: process_env.POSTGRES_USER,
		host: "postgres",
		password: process_env.POSTGRES_PASSWORD,
		database: process_env.POSTGRES_DB,
		port: 5432,
	});

	const tableOrg = "grafanadb.org";
	const queryString1a = 'SELECT COUNT(*) FROM grafanadb.org WHERE name = $1';
	const parameterArray1a = ["Main Org."];
	let result0;
	try {
		result0 = await pool.query(queryString1a, parameterArray1a);
	} catch (err) {
		logger.log("error", `Table ${tableOrg} can not found: %s`, err.message);
	}

	if (result0.rows[0].count !== 0) {
		const tableBuilding = "grafanadb.building";
		const queryStringBuilding = `
			CREATE TABLE IF NOT EXISTS ${tableBuilding}(
				id serial PRIMARY KEY,
				name VARCHAR(190) UNIQUE,
				geolocation POINT,
				geodata jsonb NOT NULL DEFAULT '{}'::jsonb,
				outer_bounds float8[2][2],
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ
			);

			CREATE INDEX IF NOT EXISTS idx_building_name
			ON grafanadb.building(name);`;

		try {
			await pool.query(queryStringBuilding);
			logger.log("info", `Table ${tableBuilding} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableBuilding} can not be created: %s`, err.message);
		}

		const queryStringInsertBuilding = `INSERT INTO ${tableBuilding} (name, geolocation, created, updated) VALUES ($1, $2, NOW(), NOW())`;
		const queryParametersInsertBuilding = [process_env.MAIN_ORGANIZATION_NAME, `(0,0)`];
		try {
			await pool.query(queryStringInsertBuilding, queryParametersInsertBuilding);
			logger.log("info", `Data in table ${tableBuilding} has been inserted sucessfully`);
		} catch (err) {
			logger.log("error", `Data in table ${tableBuilding} con not been inserted: %s`, err.message);
		}

		const tableFloor = "grafanadb.floor";
		const queryStringFloor = `
			CREATE TABLE IF NOT EXISTS ${tableFloor}(
				id serial PRIMARY KEY,
				building_id bigint,
				floor_number integer,
				geodata jsonb NOT NULL DEFAULT '{}'::jsonb,
				outer_bounds float8[2][2],
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ,
				CONSTRAINT fk_building_id
					FOREIGN KEY(building_id)
						REFERENCES grafanadb.building(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_floor_building_id_floor_number
			ON grafanadb.floor(building_id,floor_number)`;

		try {
			await pool.query(queryStringFloor);
			logger.log("info", `Table ${tableFloor} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableFloor} can not be created: %s`, err.message);
		}

		const queryStringInsertFloor = `INSERT INTO ${tableFloor} (building_id, floor_number, created, updated) VALUES ($1, $2, NOW(), NOW())`;
		const queryParametersInsertFloor = [1, 0];
		try {
			await pool.query(queryStringInsertFloor, queryParametersInsertFloor);
			logger.log("info", `Data in table ${tableFloor} has been inserted sucessfully`);
		} catch (err) {
			logger.log("error", `Data in table ${tableFloor} con not been inserted: %s`, err.message);
		}

		const tableUser = "grafanadb.user";
		const queryStringAlterUser = `ALTER TABLE grafanadb.user
								ADD COLUMN first_name varchar(127),
								ADD COLUMN surname varchar(127),
								ADD COLUMN telegram_id varchar(40) UNIQUE`;
		try {
			await pool.query(queryStringAlterUser);
			logger.log("info", `Column telegram_id has been added sucessfully to Table ${tableUser}`);
		} catch (err) {
			logger.log("error", `Column telegram_id can not be added sucessfully to Table ${tableUser}: %s`, err.message);
		}

		const plaformAdminUser = {
			id: 2,
			name: `${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
			firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
			surname: process_env.PLATFORM_ADMIN_SURNAME,
			email: process_env.PLATFORM_ADMIN_EMAIL,
			login: process_env.PLATFORM_ADMIN_USER_NAME,
			password: process_env.PLATFORM_ADMIN_PASSWORD,
			telegramId: process_env.PLATFORM_ADMIN_TELEGRAM_ID,
			OrgId: 1
		}
		await grafanaApi.createUser(plaformAdminUser);
		await grafanaApi.createOrgApiAdminUser(1);

		const queryStringUpdateUser = 'UPDATE grafanadb.user SET first_name = $1, surname = $2, telegram_id = $3 WHERE id = $4';
		try {
			await pool.query(queryStringUpdateUser,
				[
					process_env.PLATFORM_ADMIN_FIRST_NAME,
					process_env.PLATFORM_ADMIN_SURNAME,
					`${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
					2
				]);
		} catch (err) {
			logger.log("error", `Platform admin user can not be updated: %s`, err.message);
		}
		await grafanaApi.giveGrafanaAdminPermissions(2);
		await grafanaApi.changeUserRoleInOrganization(1, 2, "Admin");

		const queryStringAlterOrg = `ALTER TABLE grafanadb.org
								ADD COLUMN acronym varchar(20) UNIQUE,
								ADD COLUMN building_id bigint`;
		try {
			await pool.query(queryStringAlterOrg);
			logger.log("info", `Column acronym has been added sucessfully to Table ${tableOrg}`);
		} catch (err) {
			logger.log("error", `Column acronym can not be added sucessfully to Table ${tableOrg}: %s`, err.message);
		}

		const queryStringUpdateOrg = `UPDATE grafanadb.org SET name = $1,  acronym = $2, address1 = $3, city = $4, zip_code = $5,
								state = $6, country = $7, building_id = $8 WHERE name = $9`;
		const parameterArrayUpdateOrg = [
			process_env.MAIN_ORGANIZATION_NAME,
			process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
			process_env.MAIN_ORGANIZATION_ADDRESS1,
			process_env.MAIN_ORGANIZATION_CITY,
			process_env.MAIN_ORGANIZATION_ZIP_CODE,
			process_env.MAIN_ORGANIZATION_STATE,
			process_env.MAIN_ORGANIZATION_COUNTRY,
			1,
			"Main Org."
		];
		let apiKeyMainOrg: string;

		try {
			await pool.query(queryStringUpdateOrg, parameterArrayUpdateOrg);
			const apyKeyName = `ApiKey_${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").replace(/"/g, "").toUpperCase()}`
			const apiKeyData = { name: apyKeyName, role: "Admin" };
			const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
			apiKeyMainOrg = apiKeyObj.key;
			logger.log("info", `Table ${tableOrg} has been updated sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableOrg} can not be updated: %s`, err.message);
		}

		const tableOrgToken = "grafanadb.org_token";
		const queryStringOrgToken = `
			CREATE TABLE IF NOT EXISTS ${tableOrgToken}(
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
			await pool.query(queryStringOrgToken);
			logger.log("info", `Table ${tableOrgToken} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableOrgToken} can not be created: %s`, err.message);
		}

		const queryStringInsertOrgToken = `INSERT INTO ${tableOrgToken} (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`
		const hashedApiKey = encrypt(apiKeyMainOrg);
		const queryParametersInsertOrgToken = [1, 1, hashedApiKey];
		try {
			await pool.query(queryStringInsertOrgToken, queryParametersInsertOrgToken);
			logger.log("info", `Data in table ${tableOrgToken} has been inserted sucessfully`);
		} catch (err) {
			logger.log("error", `Data in table ${tableOrgToken} con not been inserted: %s`, err.message);
		}

		let group: IGroup;
		const mainOrgGroupName = defaultOrgGroupName(process_env.MAIN_ORGANIZATION_NAME, process_env.MAIN_ORGANIZATION_ACRONYM);
		const mainOrgGroupAcronym = `${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").replace(/"/g, "").toUpperCase()}_GRAL`;
		const orgAcronym = process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_");
		const orgName = process_env.MAIN_ORGANIZATION_NAME;
		const tableGroup = "grafanadb.group";
		const queryStringGroup = `
			CREATE TABLE IF NOT EXISTS ${tableGroup}(
				id serial PRIMARY KEY,
				org_id bigint,
				team_id bigint,
				folder_id bigint,
				folder_uid VARCHAR(40),
				name VARCHAR(190) UNIQUE,
				acronym varchar(20) UNIQUE,
				group_uid VARCHAR(42) UNIQUE,
				telegram_invitation_link VARCHAR(60),
				telegram_chatid VARCHAR(15),
				email_notification_channel_id bigint,
				telegram_notification_channel_id bigint,
				is_org_default_group BOOLEAN DEFAULT true,
				floor_number integer NOT NULL DEFAULT 0,
				feature_index integer NOT NULL DEFAULT 0,
				outer_bounds float8[2][2],
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
			await pool.query(queryStringGroup);
			const mainOrgGroupAdmin = {
				userId: 2,
				firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
				surname: process_env.PLATFORM_ADMIN_SURNAME,
				email: process_env.PLATFORM_ADMIN_EMAIL
			}
			const defaultMainOrgGroup = {
				name: mainOrgGroupName,
				acronym: mainOrgGroupAcronym,
				email: `${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").replace(/"/g, "").toLocaleLowerCase()}_general@test.com`,
				telegramChatId: process_env.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
				telegramInvitationLink: process_env.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
				folderPermission: ("Viewer" as FolderPermissionOption),
				groupAdminDataArray: [mainOrgGroupAdmin],
				floorNumber: 0,
				featureIndex: 0,
			}
			group = await createGroup(1, defaultMainOrgGroup, process_env.MAIN_ORGANIZATION_NAME, true);
			await createHomeDashboard(1, orgAcronym, orgName, group.folderId);
			const groupMember = {
				userId: 2,
				firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
				surname: process_env.PLATFORM_ADMIN_SURNAME,
				email: process_env.PLATFORM_ADMIN_EMAIL,
				roleInGroup: "Admin" as RoleInGroupOption
			}
			await addMembersToGroup(group, [groupMember])
			logger.log("info", `Table ${tableGroup} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableGroup} can not be created: %s`, err.message);
		}

		const tableDevice = "grafanadb.device";
		const queryStringDevice = `
			CREATE TABLE IF NOT EXISTS ${tableDevice}(
				id serial PRIMARY KEY,
				org_id bigint,
				group_id bigint,
				name VARCHAR(190) UNIQUE,
				description VARCHAR(190),
				device_uid VARCHAR(40) UNIQUE,
				geolocation POINT,
				type VARCHAR(40),
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
			await pool.query(queryStringDevice);
			logger.log("info", `Table ${tableDevice} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableDevice} can not be created: %s`, err.message);
		}

		const tableTopic = "grafanadb.topic";
		const queryStringTopic = `
			CREATE TABLE IF NOT EXISTS ${tableTopic}(
				id serial PRIMARY KEY,
				device_id bigint,
				topic_type VARCHAR(40),
				topic_name VARCHAR(190) UNIQUE,
				description VARCHAR(190),
				payload_format json,
				topic_uid VARCHAR(40) UNIQUE,
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ,
				CONSTRAINT fk_device_id
					FOREIGN KEY(device_id)
						REFERENCES grafanadb.device(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_topic_name
			ON grafanadb.topic(topic_name);`;

		try {
			await pool.query(queryStringTopic);
			logger.log("info", `Table ${tableTopic} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableTopic} can not be created: %s`, err.message);
		}

		const tableDigitalTwin = "grafanadb.digital_twin";
		const queryStringDigitalTwin = `
			CREATE TABLE IF NOT EXISTS ${tableDigitalTwin}(
				id serial PRIMARY KEY,
				device_id bigint,
				name VARCHAR(190) UNIQUE,
				description VARCHAR(190),
				type VARCHAR(40),
				dashboard_id bigint,
				gltfdata jsonb NOT NULL DEFAULT '{}'::jsonb,
				gltf_file_name VARCHAR(50) DEFAULT '-',
				gltf_file_last_modif_date_string VARCHAR(190),
				fem_simulation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
				femsimdata_file_name VARCHAR(50) DEFAULT '-',
				femsimdata_file_last_modif_date_string VARCHAR(190),
				created TIMESTAMPTZ,
				updated TIMESTAMPTZ,
				CONSTRAINT fk_device_id
					FOREIGN KEY(device_id)
						REFERENCES grafanadb.device(id)
						ON DELETE CASCADE,
				CONSTRAINT fk_dashboard_id
					FOREIGN KEY(dashboard_id)
						REFERENCES grafanadb.dashboard(id)
						ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_digital_twin_name
			ON grafanadb.digital_twin(name);`;

		try {
			await pool.query(queryStringDigitalTwin);
			logger.log("info", `Table ${tableDigitalTwin} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableDigitalTwin} can not be created: %s`, err.message);
		}

		const tableThingData = "iot_data.thingData";
		const queryStringAlterThingData = `
			ALTER TABLE ${tableThingData}
				ADD CONSTRAINT fk_group_uid
				FOREIGN KEY(group_uid)
				REFERENCES grafanadb.group(group_uid)
					ON DELETE CASCADE
					ON UPDATE CASCADE,
				ADD CONSTRAINT fk_device_uid
				FOREIGN KEY(device_uid)
				REFERENCES grafanadb.device(device_uid)
					ON DELETE CASCADE
					ON UPDATE CASCADE,
				ADD CONSTRAINT fk_topic_uid
				FOREIGN KEY(topic_uid)
				REFERENCES grafanadb.topic(topic_uid)
					ON DELETE CASCADE
					ON UPDATE CASCADE;`;

		try {
			await pool.query(queryStringAlterThingData);
			const defaultGroupDevicesData = [
				{
					name: defaultGroupDeviceName(group, "Generic"),
					description: `Default generic device of the group ${mainOrgGroupAcronym}`,
					latitude: 0,
					longitude: 0,
					type: "Generic"
				},
				{
					name: defaultGroupDeviceName(group, "Mobile"),
					description: `Default mobile device of the group ${mainOrgGroupAcronym}`,
					latitude: 0,
					longitude: 0,
					type: "Mobile"
				},
			];
			const device1 = await createDevice(group, defaultGroupDevicesData[0]);
			const device2 = await createDevice(group, defaultGroupDevicesData[1]);

			const defaultDeviceTopicsData = [
				{
					topicType: "dev2pdb",
					topicName: demoTopicName(group, device1, "Temperature"),
					description: `Temperature sensor for ${defaultGroupDeviceName(group, "Generic")} device`,
					payloadFormat: '{"temp": {"type": "number", "unit":"°C"}}'
				},
				{
					topicType: "dev2pdb",
					topicName: demoTopicName(group, device2, "Accelerometer"),
					description: `Accelerometer for ${defaultGroupDeviceName(group, "Mobile")} device`,
					payloadFormat: '{ "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}'
					// payloadFormat: '{"accelerations": {"type": "array", "items": { "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}}}'
				},
			];
			const topic1 = await createTopic(device1.id, defaultDeviceTopicsData[0]);
			const topic2 = await createTopic(device2.id, defaultDeviceTopicsData[1]);

			const dashboardsId: number[] = [];

			[dashboardsId[0], dashboardsId[1]] =
				await createDemoDashboards(orgAcronym, group, [device1, device2], [topic1, topic2]);

			const defaultDeviceDigitalTwinsData = [
				{
					name: demoDigitalTwinName(group, "Generic"),
					description: `Demo digital twin for default generic device of the group ${mainOrgGroupAcronym}`,
					type: "Grafana dashboard",
					dashboardId: dashboardsId[0],
					gltfData: "{}",
					gltfFileName: "-",
					gltfFileLastModifDateString: "-",
					femSimulationData: "{}",
					femSimDataFileName: "-",
					femSimDataFileLastModifDateString: "-",
				},
				{
					name: demoDigitalTwinName(group, "Mobile"),
					description: `Demo digital twin for default mobile device of the group ${mainOrgGroupAcronym}`,
					type: "Grafana dashboard",
					dashboardId: dashboardsId[1],
					gltfData: "{}",
					gltfFileName: "-",
					gltfFileLastModifDateString: "-",
					femSimulationData: "{}",
					femSimDataFileName: "-",
					femSimDataFileLastModifDateString: "-",
				},
			];

			await createDigitalTwin(device1.id, defaultDeviceDigitalTwinsData[0]);
			await createDigitalTwin(device2.id, defaultDeviceDigitalTwinsData[1]);

			logger.log("info", `Foreing key in table ${tableThingData} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Foreing key in table ${tableThingData} could not be created: %s`, err.message);
		}


		const tableRefreshToken = "grafanadb.refresh_token";
		const queryStringtableRefreshToken = `
			CREATE TABLE IF NOT EXISTS ${tableRefreshToken}(
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
			await pool.query(queryStringtableRefreshToken);
			logger.log("info", `Table ${tableRefreshToken} has been created sucessfully`);
		} catch (err) {
			logger.log("error", `Table ${tableRefreshToken} can not be created: %s`, err.message);
		}

		const tableAlertNotification = "grafanadb.alert_notification";
		const queryStringAlterAlertNotification = `
				ALTER TABLE grafanadb.alert_notification
					ADD CONSTRAINT fk_org_id
					FOREIGN KEY(org_id)
					REFERENCES grafanadb.org(id)
						ON DELETE CASCADE;`;

		try {
			await pool.query(queryStringAlterAlertNotification);
			logger.log("info", `Foreing key in table ${tableAlertNotification} has been added sucessfully`);
		} catch (err) {
			logger.log("error", `Foreing key in table ${tableAlertNotification} couldd not be added: %s`, err.message);
		}

		pool.end(() => {
			logger.log("info", `Migration pool has ended`);
		})
	}
}
