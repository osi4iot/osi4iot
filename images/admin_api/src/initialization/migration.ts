import { logger } from "../config/winston";
import { Pool } from "pg";
import grafanaApi from "../GrafanaApi"
import { encrypt } from "../utils/encryptAndDecrypt/encryptAndDecrypt";
import { addMembersToGroup, createGroup, defaultOrgGroupName } from "../components/group/groupDAL";
import { FolderPermissionOption } from "../components/group/interfaces/FolerPermissionsOptions";
import { createDemoDashboards, createHomeDashboard } from "../components/group/dashboardDAL";
import { createDevice, defaultGroupDeviceName } from "../components/device/deviceDAL";
import IGroup from "../components/group/interfaces/Group.interface";
import { RoleInGroupOption } from "../components/group/interfaces/RoleInGroupOptions";
import { createTopic, demoTopicName } from "../components/topic/topicDAL";
import { createDigitalTwin, demoDigitalTwinDescription, generateDigitalTwinUid } from "../components/digitalTwin/digitalTwinDAL";
import process_env from "../config/api_config";
import IDevice from "../components/device/device.interface";
import { createMasterDevicesInOrg } from "../components/masterDevice/masterDeviceDAL";
import IMasterDevice from "../components/masterDevice/masterDevice.interface";
import needle from "needle";
import ITopic from "../components/topic/topic.interface";


export async function dataBaseInitialization() {
	const pool = new Pool({
		user: process_env.POSTGRES_USER,
		host: "postgres",
		password: process_env.POSTGRES_PASSWORD,
		database: process_env.POSTGRES_DB,
		port: 5432,
	});

	const client = await pool.connect();
	const grafanaUrl = `grafana:5000/api/health`;
	const grafanaState = await needle('get', grafanaUrl)
		.then(res => (res.body.database))
		.catch(err => {
			logger.log("error", "Grafana service is not healthy: %s", err.message)
			process.exit(1);
		});

	if (client && grafanaState === "ok") {
		const tableOrg = "grafanadb.org";
		const queryString1a = 'SELECT COUNT(*) FROM grafanadb.org WHERE name = $1';
		const parameterArray1a = ["Main Org."];
		let result0 = null;
		try {
			result0 = await client.query(queryString1a, parameterArray1a);
		} catch (err) {
			logger.log("error", `Table ${tableOrg} can not found: %s`, err.message);
			process.exit(1);
		}

		if (process_env.REPLICA === "1") {

			if (result0.rows[0].count !== 0) {
				const queryStringAlterOrg = `ALTER TABLE grafanadb.org
											ADD COLUMN acronym varchar(20) UNIQUE,
											ADD COLUMN building_id bigint,
											ADD COLUMN org_hash varchar(20) UNIQUE`;
				try {
					await client.query(queryStringAlterOrg);
					logger.log("info", `Column acronym has been added sucessfully to Table ${tableOrg}`);
				} catch (err) {
					logger.log("error", `Column acronym can not be added sucessfully to Table ${tableOrg}: %s`, err.message);
				}

				const queryStringUpdateOrg = `UPDATE grafanadb.org SET name = $1,  acronym = $2, address1 = $3, city = $4, zip_code = $5,
											state = $6, country = $7, building_id = $8, org_hash = $9 WHERE name = $10`;
				const parameterArrayUpdateOrg = [
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
					process_env.MAIN_ORGANIZATION_ADDRESS1,
					process_env.MAIN_ORGANIZATION_CITY,
					process_env.MAIN_ORGANIZATION_ZIP_CODE,
					process_env.MAIN_ORGANIZATION_STATE,
					process_env.MAIN_ORGANIZATION_COUNTRY,
					1,
					process_env.MAIN_ORG_HASH,
					"Main Org."
				];

				try {
					await client.query(queryStringUpdateOrg, parameterArrayUpdateOrg);
					logger.log("info", `Table ${tableOrg} has been updated sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableOrg} can not be updated: %s`, err.message);
				}


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
					await client.query(queryStringBuilding);
					logger.log("info", `Table ${tableBuilding} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableBuilding} can not be created: %s`, err.message);
				}

				const queryStringInsertBuilding = `INSERT INTO ${tableBuilding} (name, geolocation, created, updated) VALUES ($1, $2, NOW(), NOW())`;
				const queryParametersInsertBuilding = [process_env.MAIN_ORGANIZATION_NAME, `(0,0)`];
				try {
					await client.query(queryStringInsertBuilding, queryParametersInsertBuilding);
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
					await client.query(queryStringFloor);
					logger.log("info", `Table ${tableFloor} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableFloor} can not be created: %s`, err.message);
				}

				const queryStringInsertFloor = `INSERT INTO ${tableFloor} (building_id, floor_number, created, updated) VALUES ($1, $2, NOW(), NOW())`;
				const queryParametersInsertFloor = [1, 0];
				try {
					await client.query(queryStringInsertFloor, queryParametersInsertFloor);
					logger.log("info", `Data in table ${tableFloor} has been inserted sucessfully`);
				} catch (err) {
					logger.log("error", `Data in table ${tableFloor} con not been inserted: %s`, err.message);
				}

				const tableUser = "grafanadb.user";
				const queryStringAlterUser = `ALTER TABLE grafanadb.user
									ADD COLUMN first_name varchar(127),
									ADD COLUMN surname varchar(127)`;
				try {
					await client.query(queryStringAlterUser);
					logger.log("info", `Columns first_name and surnanme have been added sucessfully to Table ${tableUser}`);
				} catch (err) {
					logger.log("error", `Columns first_name and surnanme can not be added sucessfully to Table ${tableUser}: %s`, err.message);
				}

				const plaformAdminUser = {
					id: 2,
					name: `${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
					firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
					surname: process_env.PLATFORM_ADMIN_SURNAME,
					email: process_env.PLATFORM_ADMIN_EMAIL,
					login: process_env.PLATFORM_ADMIN_USER_NAME,
					password: process_env.PLATFORM_ADMIN_PASSWORD,
					OrgId: 1
				}
				await grafanaApi.createUser(plaformAdminUser);
				await grafanaApi.createOrgApiAdminUser(1);

				const queryStringUpdateUser = 'UPDATE grafanadb.user SET first_name = $1, surname = $2, name = $3 WHERE id = $4';
				try {
					await client.query(queryStringUpdateUser,
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


				let apiKeyMainOrg: string;
				try {
					const apyKeyName = `ApiKey_${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").replace(/"/g, "").toUpperCase()}`
					const apiKeyData = { name: apyKeyName, role: "Admin" };
					const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
					apiKeyMainOrg = apiKeyObj.key;
					logger.log("info", `Api key token created sucessfully`);
				} catch (err) {
					logger.log("error", `Api key token created could not be created: %s`, err.message);
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
					await client.query(queryStringOrgToken);
					logger.log("info", `Table ${tableOrgToken} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableOrgToken} can not be created: %s`, err.message);
				}

				const queryStringInsertOrgToken = `INSERT INTO ${tableOrgToken} (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`
				const hashedApiKey = encrypt(apiKeyMainOrg);
				const queryParametersInsertOrgToken = [1, 1, hashedApiKey];
				try {
					await client.query(queryStringInsertOrgToken, queryParametersInsertOrgToken);
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
					await client.query(queryStringGroup);
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
					await client.query(queryStringDevice);
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
					await client.query(queryStringTopic);
					logger.log("info", `Table ${tableTopic} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableTopic} can not be created: %s`, err.message);
				}

				const tableDigitalTwin = "grafanadb.digital_twin";
				const queryStringDigitalTwin = `
				CREATE TABLE IF NOT EXISTS ${tableDigitalTwin}(
					id serial PRIMARY KEY,
					device_id bigint,
					digital_twin_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190),
					type VARCHAR(40),
					dashboard_id bigint,
					gltfdata jsonb NOT NULL DEFAULT '{}'::jsonb,
					gltf_file_name VARCHAR(50) DEFAULT '-',
					gltf_file_last_modif_date_string VARCHAR(190),
					fem_simulation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
					femsimdata_file_name VARCHAR(50) DEFAULT '-',
					femsimdata_file_last_modif_date_string VARCHAR(190),
					digital_twin_simulation_format jsonb NOT NULL DEFAULT '{}'::jsonb,
					sensor_simulation_topic_id  bigint,
					asset_state_topic_id bigint,
					asset_state_simulation_topic_id bigint,
					fem_result_modal_values_topic_id bigint,
					fem_result_modal_values_simulation_topic_id bigint,
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

				CREATE INDEX IF NOT EXISTS idx_digital_twin_uid
				ON grafanadb.digital_twin(digital_twin_uid);`;

				try {
					await client.query(queryStringDigitalTwin);
					logger.log("info", `Table ${tableDigitalTwin} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDigitalTwin} can not be created: %s`, err.message);
				}

				const tableDigitalTwinTopic = "grafanadb.digital_twin_topic";
				const queryStringDigitalTwinTopic = `
				CREATE TABLE IF NOT EXISTS ${tableDigitalTwinTopic}(
					digital_twin_id bigint,
					topic_id bigint,
					topic_type VARCHAR(40),
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_digital_twin_id
						FOREIGN KEY(digital_twin_id)
						REFERENCES grafanadb.digital_twin(id)
						ON DELETE CASCADE,
					CONSTRAINT fk_topic_id
						FOREIGN KEY(topic_id)
						REFERENCES grafanadb.topic(id)
						ON DELETE CASCADE
				);`;

				try {
					await client.query(queryStringDigitalTwinTopic);
					logger.log("info", `Table ${tableDigitalTwinTopic} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDigitalTwinTopic} can not be created: %s`, err.message);
				}

				const tableMasterDevice = "grafanadb.master_device";
				const queryStringMasterDevice = `
				CREATE TABLE IF NOT EXISTS ${tableMasterDevice}(
					id serial PRIMARY KEY,
					md_hash VARCHAR(40) UNIQUE,
					org_id bigint,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_org_id
						FOREIGN KEY(org_id)
						REFERENCES grafanadb.org(id)
						ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_md_hash
				ON grafanadb.master_device(md_hash);`;

				let mainMasterDevice: IMasterDevice;
				try {
					await client.query(queryStringMasterDevice);
					const masterDevices = await createMasterDevicesInOrg(process_env.MAIN_ORG_MASTER_DEVICE_HASHES, 1);
					mainMasterDevice = masterDevices[0];
					logger.log("info", `Table ${tableMasterDevice} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableMasterDevice} can not be created: %s`, err.message);
				}

				const tableDeviceMasterDevice = "grafanadb.device_mdevice";
				const queryStringDeviceMasterDevice = `
				CREATE TABLE IF NOT EXISTS ${tableDeviceMasterDevice}(
					device_id bigint,
					master_device_id bigint,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_device_id
						FOREIGN KEY(device_id)
						REFERENCES grafanadb.device(id)
						ON DELETE CASCADE,
					CONSTRAINT fk_master_device_id
						FOREIGN KEY(master_device_id)
						REFERENCES grafanadb.master_device(id)
						ON DELETE CASCADE
				);`;

				try {
					await client.query(queryStringDeviceMasterDevice);
					logger.log("info", `Table ${tableDeviceMasterDevice} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDeviceMasterDevice} can not be created: %s`, err.message);
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
					await client.query(queryStringAlterThingData);
					logger.log("info", `Foreing key in table ${tableThingData} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Foreing key in table ${tableThingData} could not be created: %s`, err.message);
				}

				let device1: IDevice;
				let device2: IDevice;
				try {
					const defaultGroupDevicesData = [
						{
							name: defaultGroupDeviceName(group, "Main master"),
							description: `Main master device of the group ${mainOrgGroupAcronym}`,
							latitude: 0,
							longitude: 0,
							type: "Main master"
						},
						{
							name: defaultGroupDeviceName(group, "Generic"),
							description: `Default generic device of the group ${mainOrgGroupAcronym}`,
							latitude: 0,
							longitude: 0,
							type: "Generic"
						},
					];
					device1 = await createDevice(group, defaultGroupDevicesData[0]);
					device2 = await createDevice(group, defaultGroupDevicesData[1]);
					logger.log("info", `Default group devices has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default group devices could not be created: %s`, err.message);
				}


				let topic1: ITopic;
				let topic2: ITopic;
				try {
					const defaultDeviceTopicsData = [
						{
							topicType: "dev2pdb",
							topicName: demoTopicName(group, device1, "Temperature"),
							description: `Temperature sensor for ${defaultGroupDeviceName(group, "Main master")} device`,
							payloadFormat: '{"temp": {"type": "number", "unit":"°C"}}'
						},
						{
							topicType: "dev2pdb",
							topicName: demoTopicName(group, device2, "Accelerometer"),
							description: `Accelerometer for ${defaultGroupDeviceName(group, "Generic")} device`,
							payloadFormat: '{"accelerations": {"type": "array", "items": { "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}}}'
						},
					];
					topic1 = await createTopic(device1.id, defaultDeviceTopicsData[0]);
					topic2 = await createTopic(device2.id, defaultDeviceTopicsData[1]);

					logger.log("info", `Default device topics has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default device topics could not be created: %s`, err.message);
				}

				try {
					const dashboardsId: number[] = [];

					[dashboardsId[0], dashboardsId[1]] =
						await createDemoDashboards(orgAcronym, group, [device1, device2], [topic1, topic2]);

					const defaultDeviceDigitalTwinsData = [
						{
							digitalTwinUid: generateDigitalTwinUid(),
							description: demoDigitalTwinDescription(group, "Main master"),
							type: "Grafana dashboard",
							gltfData: "{}",
							gltfFileName: "-",
							gltfFileLastModifDateString: "-",
							femSimulationData: "{}",
							femSimDataFileName: "-",
							femSimDataFileLastModifDateString: "-",
							digitalTwinSimulationFormat: "{}"
						},
						{
							digitalTwinUid: generateDigitalTwinUid(),
							description: demoDigitalTwinDescription(group, "Generic"),
							type: "Grafana dashboard",
							gltfData: "{}",
							gltfFileName: "-",
							gltfFileLastModifDateString: "-",
							femSimulationData: "{}",
							femSimDataFileName: "-",
							femSimDataFileLastModifDateString: "-",
							digitalTwinSimulationFormat: "{}"
						},
					];

					await createDigitalTwin(group, device1, defaultDeviceDigitalTwinsData[0], dashboardsId[0], topic1);
					await createDigitalTwin(group, device2, defaultDeviceDigitalTwinsData[1], dashboardsId[1], topic2);

					logger.log("info", `Default device digital twins has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default device digital twins could not be created: %s`, err.message);
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
					await client.query(queryStringtableRefreshToken);
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
					await client.query(queryStringAlterAlertNotification);
					logger.log("info", `Foreing key in table ${tableAlertNotification} has been added sucessfully`);
				} catch (err) {
					logger.log("error", `Foreing key in table ${tableAlertNotification} couldd not be added: %s`, err.message);
				}


				pool.end(() => {
					logger.log("info", `Migration pool has ended`);
				})
			}
		}
	} else {
		process.exit(1);
	}

}
