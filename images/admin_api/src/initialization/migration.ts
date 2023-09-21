import { logger } from "../config/winston";
import { Pool } from "pg";
import grafanaApi from "../GrafanaApi"
import { encrypt } from "../utils/encryptAndDecrypt/encryptAndDecrypt";
import {
	addMembersToGroup,
	createGroup,
	createView,
	defaultOrgGroupName,
	getAllGroups
} from "../components/group/groupDAL";
import { FolderPermissionOption } from "../components/group/interfaces/FolerPermissionsOptions";
import { createHomeDashboard, createSensorDashboard } from "../components/group/dashboardDAL";
import { createDevice } from "../components/device/deviceDAL";
import IGroup from "../components/group/interfaces/Group.interface";
import { RoleInGroupOption } from "../components/group/interfaces/RoleInGroupOptions";
import { createTopic } from "../components/topic/topicDAL";
import process_env from "../config/api_config";
import IDevice from "../components/device/device.interface";
import needle from "needle";
import ITopic from "../components/topic/topic.interface";
import { createFictitiousUserForService } from "../components/user/userDAL";
import INodeRedInstance from "../components/nodeRedInstance/nodeRedInstance.interface";
import {
	assignNodeRedInstanceToGroup,
	createNodeRedInstancesInOrg
} from "../components/nodeRedInstance/nodeRedInstanceDAL";
import s3Client from "../config/s3Config";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
	getOrganizations
} from "../components/organization/organizationDAL";
import { createTimescaledbOrgDataSource } from "../components/group/datasourceDAL";
import IAsset from "../components/asset/asset.interface";
import { createNewAsset } from "../components/asset/assetDAL";
import { createNewSensor } from "../components/sensor/sensorDAL";
import CreateSensorDto from "../components/sensor/sensor.dto";
import { nanoid } from "nanoid";

export const dataBaseInitialization = async () => {
	const timescaledb_pool = new Pool({
		max: 20,
		user: process_env.TIMESCALE_USER,
		host: "timescaledb",
		password: process_env.TIMESCALE_PASSWORD,
		database: process_env.TIMESCALE_DB,
		port: 5432,
		idleTimeoutMillis: 30000,
	});

	const timescaledbClient = await timescaledb_pool.connect();

	const pool = new Pool({
		user: process_env.POSTGRES_USER,
		host: "postgres",
		password: process_env.POSTGRES_PASSWORD,
		database: process_env.POSTGRES_DB,
		port: 5432,
	});
	const postgresClient = await pool.connect();

	const grafanaUrl = `grafana:5000/api/health`;
	const grafanaState = await needle('get', grafanaUrl)
		.then(res => (res.body.database as string))
		.catch(err => {
			logger.log("error", "Grafana service is not healthy: %s", err.message)
			process.exit(1);
		});

	let existPlatformS3Bucket = false;
	if (process_env.DEPLOYMENT_LOCATION !== "AWS cluster deployment") {
		const minioUrl = `minio:9000/minio/health/live`;
		await needle('get', minioUrl)
			.then(() => "ok")
			.catch(err => {
				logger.log("error", "Minio service is not healthy: %s", err.message)
				process.exit(1);
			});
	}


	try {
		const listBucketsResult = await s3Client.send(new ListBucketsCommand({}));
		const bucketName = process_env.S3_BUCKET_NAME;
		existPlatformS3Bucket = listBucketsResult.Buckets.filter(bucket => bucket.Name === bucketName).length !== 0;
		if (!existPlatformS3Bucket) {
			await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
			logger.log("info", `The S3 bucket for the platform has been created successfully`)
		} else {
			logger.log("info", `An S3 bucket with the name ${bucketName} already has been created`)
		}
	} catch (err) {
		logger.log("error", "The S3 bucket for the platform can not be created: %s", err)
		process.exit(1);
	}


	if (timescaledbClient && postgresClient && grafanaState === "ok" && existPlatformS3Bucket) {
		const tableOrg = "grafanadb.org";
		const queryString1a = 'SELECT COUNT(*) FROM grafanadb.org WHERE name = $1';
		const parameterArray1a = ["Main Org."];
		let result0 = null;
		try {
			result0 = await postgresClient.query(queryString1a, parameterArray1a);
		} catch (err) {
			logger.log("error", `Table ${tableOrg} can not found: %s`, err.message);
			process.exit(1);
		}

		const tableThingData = "iot_data.thingData";
		const queryString2 = `SELECT '${tableThingData}'::regclass;`;
		try {
			await timescaledbClient.query(queryString2);
		} catch (err) {
			logger.log("error", `Table ${tableThingData} can not found in timescaledb: %s`, err.message);
			process.exit(1);
		}

		if (process_env.REPLICA === "1") {

			if (result0.rows[0].count !== 0) {
				const queryStringAlterOrg = `ALTER TABLE grafanadb.org
											ADD COLUMN acronym varchar(20) UNIQUE,
											ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'Generic',
											ADD COLUMN building_id bigint,
											ADD COLUMN org_hash varchar(20) UNIQUE,
											ADD COLUMN mqtt_access_control VARCHAR(10)`;
				try {
					await postgresClient.query(queryStringAlterOrg);
					logger.log("info", `Column acronym has been added sucessfully to Table ${tableOrg}`);
				} catch (err) {
					logger.log("error", `Column acronym can not be added sucessfully to Table ${tableOrg}: %s`, err.message);
				}

				const queryStringUpdateOrg = `UPDATE grafanadb.org SET name = $1,  acronym = $2, role = $3, address1 = $4, city = $5, 
				                            zip_code = $6, state = $7, country = $8, building_id = $9, org_hash = $10,
											mqtt_access_control = $11 WHERE name = $12`;
				const parameterArrayUpdateOrg = [
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
					"Main",
					process_env.MAIN_ORGANIZATION_ADDRESS1,
					process_env.MAIN_ORGANIZATION_CITY,
					process_env.MAIN_ORGANIZATION_ZIP_CODE,
					process_env.MAIN_ORGANIZATION_STATE,
					process_env.MAIN_ORGANIZATION_COUNTRY,
					1,
					process_env.MAIN_ORG_HASH,
					"Pub & Sub",
					"Main Org."
				];

				try {
					await postgresClient.query(queryStringUpdateOrg, parameterArrayUpdateOrg);
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
					await postgresClient.query(queryStringBuilding);
					logger.log("info", `Table ${tableBuilding} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableBuilding} can not be created: %s`, err.message);
				}

				const queryStringInsertBuilding = `INSERT INTO ${tableBuilding} (name, geolocation, created, updated) VALUES ($1, $2, NOW(), NOW())`;
				const queryParametersInsertBuilding = [process_env.MAIN_ORGANIZATION_NAME, `(0,0)`];
				try {
					await postgresClient.query(queryStringInsertBuilding, queryParametersInsertBuilding);
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
					await postgresClient.query(queryStringFloor);
					logger.log("info", `Table ${tableFloor} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableFloor} can not be created: %s`, err.message);
				}

				const queryStringInsertFloor = `INSERT INTO ${tableFloor} (building_id, floor_number, created, updated) VALUES ($1, $2, NOW(), NOW())`;
				const queryParametersInsertFloor = [1, 0];
				try {
					await postgresClient.query(queryStringInsertFloor, queryParametersInsertFloor);
					logger.log("info", `Data in table ${tableFloor} has been inserted sucessfully`);
				} catch (err) {
					logger.log("error", `Data in table ${tableFloor} con not been inserted: %s`, err.message);
				}

				const tableUser = "grafanadb.user";
				const queryStringAlterUser = `ALTER TABLE grafanadb.user
									ADD COLUMN first_name varchar(127),
									ADD COLUMN surname varchar(127)`;
				try {
					await postgresClient.query(queryStringAlterUser);
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

				const dev2pdbUser = {
					id: 3,
					name: "dev2pdb",
					firstName: "",
					surname: "",
					email: "",
					login: "dev2pdb",
					password: process_env.DEV2PDB_PASSWORD,
					OrgId: 1
				}
				try {
					await createFictitiousUserForService(dev2pdbUser);
				} catch (err) {
					logger.log("error", `Fictitiou user for service dev2pdb could not be created: %s`, err.message);
				}

				const queryStringUpdateUser = 'UPDATE grafanadb.user SET first_name = $1, surname = $2, name = $3 WHERE id = $4';
				try {
					await postgresClient.query(queryStringUpdateUser,
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
					await postgresClient.query(queryStringOrgToken);
					logger.log("info", `Table ${tableOrgToken} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableOrgToken} can not be created: %s`, err.message);
				}

				const queryStringInsertOrgToken = `INSERT INTO ${tableOrgToken} (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`
				const hashedApiKey = encrypt(apiKeyMainOrg);
				const queryParametersInsertOrgToken = [1, 1, hashedApiKey];
				try {
					await postgresClient.query(queryStringInsertOrgToken, queryParametersInsertOrgToken);
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
					 mqtt_access_control VARCHAR(10),
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
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
					await postgresClient.query(queryStringGroup);
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
						mqttAccessControl: "Pub & Sub"
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
					device_uid VARCHAR(40) UNIQUE,
					geolocation POINT,
					type VARCHAR(40),
					icon_radio real NOT NULL DEFAULT 1.0,
					mqtt_password VARCHAR(255),
					mqtt_salt VARCHAR(40),
					mqtt_access_control VARCHAR(10),
					master_device_url VARCHAR(255),
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
				
				CREATE INDEX IF NOT EXISTS idx_device_uid
				ON grafanadb.device(device_uid);`;

				try {
					await postgresClient.query(queryStringDevice);
					logger.log("info", `Table ${tableDevice} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDevice} can not be created: %s`, err.message);
				}

				const tableAsset = "grafanadb.asset";
				const queryStringAsset = `
				CREATE TABLE IF NOT EXISTS ${tableAsset}(
					id serial PRIMARY KEY,
					group_id bigint,
					asset_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190),
					geolocation POINT,
					type VARCHAR(40),
					icon_radio real NOT NULL DEFAULT 1.0,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE			
				);

				CREATE INDEX IF NOT EXISTS idx_asset_uid
				ON grafanadb.asset(asset_uid);`;

				try {
					await postgresClient.query(queryStringAsset);
					logger.log("info", `Table ${tableAsset} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableAsset} can not be created: %s`, err.message);
				}

				let asset: IAsset;
				try {
					const defaultAssetData = {
						description: `Mobile for group ${group.acronym}`,
						type: "mobile",
						iconRadio: 1.0,
						longitude: 0.0,
						latitude: 0.0,
					}
					asset = await createNewAsset(group, defaultAssetData);
					logger.log("info", `Default asset for main group has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableAsset} can not be created: %s`, err.message);
				}

				const tableTopic = "grafanadb.topic";
				const queryStringTopic = `
				CREATE TABLE IF NOT EXISTS ${tableTopic}(
					id serial PRIMARY KEY,
					device_id bigint,
					topic_type VARCHAR(40),
					description VARCHAR(190),
					payload_format jsonb,
					topic_uid VARCHAR(40) UNIQUE,
					mqtt_access_control VARCHAR(10),
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_device_id
						FOREIGN KEY(device_id)
							REFERENCES grafanadb.device(id)
							ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_topic_uid
				ON grafanadb.topic(topic_uid);`;

				try {
					await postgresClient.query(queryStringTopic);
					logger.log("info", `Table ${tableTopic} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableTopic} can not be created: %s`, err.message);
				}

				const tableSensor = "grafanadb.sensor";
				const queryStringSensor = `
				CREATE TABLE IF NOT EXISTS ${tableSensor}(
					id serial PRIMARY KEY,
					asset_id bigint,
					sensor_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190),
					topic_id bigint,
					payload_key VARCHAR(40),
					param_label VARCHAR(40),
					value_type VARCHAR(10),
					units VARCHAR(10),
					dashboard_id bigint,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					UNIQUE (topic_id, payload_key),
					CONSTRAINT fk_asset_id
						FOREIGN KEY(asset_id)
							REFERENCES grafanadb.asset(id)
								ON DELETE CASCADE,
					CONSTRAINT fk_dashboard_id
						FOREIGN KEY(dashboard_id)
							REFERENCES grafanadb.dashboard(id),
					CONSTRAINT fk_sensor_topic_id
						FOREIGN KEY(topic_id)
							REFERENCES grafanadb.topic(id)
				);

				CREATE INDEX IF NOT EXISTS idx_sensor_uid
				ON grafanadb.sensor(sensor_uid);`;

				try {
					await postgresClient.query(queryStringSensor);
					logger.log("info", `Table ${tableSensor} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableSensor} can not be created: %s`, err.message);
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
					max_num_resfem_files SMALLINT NOT NULL DEFAULT 1,
					digital_twin_simulation_format jsonb NOT NULL DEFAULT '{}'::jsonb,
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
					await postgresClient.query(queryStringDigitalTwin);
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
					await postgresClient.query(queryStringDigitalTwinTopic);
					logger.log("info", `Table ${tableDigitalTwinTopic} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDigitalTwinTopic} can not be created: %s`, err.message);
				}

				const tableMLModel = "grafanadb.ml_model";
				const queryStringMLModel = `
				CREATE TABLE IF NOT EXISTS ${tableMLModel}(
					id serial PRIMARY KEY,
					group_id bigint,
					ml_model_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190) UNIQUE,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_ml_model__uid
				ON grafanadb.ml_model(ml_model_uid);`;

				try {
					await postgresClient.query(queryStringMLModel);
					logger.log("info", `Table ${tableMLModel} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableMLModel} can not be created: %s`, err.message);
				}

				const tableNodeRedInstance = "grafanadb.nodered_instance";
				const queryStringodeRedInstance = `
				CREATE TABLE IF NOT EXISTS ${tableNodeRedInstance}(
					id serial PRIMARY KEY,
					nri_hash VARCHAR(40) UNIQUE,
					org_id bigint,
					group_id bigint,
					geolocation POINT,
					icon_radio real NOT NULL DEFAULT 1.0,
					deleted boolean NOT NULL DEFAULT FALSE,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_org_id
						FOREIGN KEY(org_id)
						REFERENCES grafanadb.org(id)
						ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_nri_hash
				ON grafanadb.nodered_instance(nri_hash);`;

				let mainNodeRedInstance: INodeRedInstance;
				try {
					await postgresClient.query(queryStringodeRedInstance);
					const nodeRedInstances = await createNodeRedInstancesInOrg(process_env.MAIN_ORG_NODERED_INSTANCE_HASHES, 1);
					mainNodeRedInstance = nodeRedInstances[0];
					logger.log("info", `Table ${tableNodeRedInstance} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableNodeRedInstance} can not be created: %s`, err.message);
				}

				try {
					await assignNodeRedInstanceToGroup(mainNodeRedInstance, group.id);
					logger.log("info", `NodeRed instance assigned to group with id: ${group.id}`);
				} catch (err) {
					logger.log("error", `NodeRed instance can not be assigned to group with id: ${group.id}: %s`, err.message);
				}

				let device: IDevice;
				try {
					const defaultGroupDeviceData =
					{
						latitude: 0.0,
						longitude: 0.0,
						type: "Generic",
						iconRadio: 1.0,
						mqttAccessControl: "Pub & Sub"
					};

					device = await createDevice(group, defaultGroupDeviceData);
					logger.log("info", `Default group device has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default group device could not be created: %s`, err.message);
				}


				let topic1: ITopic;
				let topic2: ITopic;
				let topic3: ITopic;
				let topic4: ITopic;
				try {
					const defaultDeviceTopicsData = [
						{
							topicType: "dev2pdb",
							description: `Mobile temperature topic`,
							payloadFormat: '{"temp": {"type": "number", "unit":"°C"}}',
							mqttAccessControl: "Pub & Sub"
						},
						{
							topicType: "dev2pdb_wt",
							description: `Mobile accelerations topic`,
							payloadFormat: '{"mobile_accelerations": {"type": "array", "items": { "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}}}',
							mqttAccessControl: "Pub & Sub"
						},
						{
							topicType: "dev2pdb_wt",
							description: `Mobile orientation topic`,
							payloadFormat: '{"mobile_quaternion":{"type":"array","items":{"q0":{"type":"number","units":"None"},"q1":{"type":"number","units":"None"},"q2":{"type":"number","units":"None"},"q3":{"type":"number","units":"None"}}}}',
							mqttAccessControl: "Pub & Sub"
						},
						{
							topicType: "dev2dtm",
							description: `Mobile photo topic`,
							payloadFormat: '{"mobile_photo": {"type": "string"}}',
							mqttAccessControl: "Pub & Sub"
						},
					];
					topic1 = await createTopic(device.id, defaultDeviceTopicsData[0]);
					topic2 = await createTopic(device.id, defaultDeviceTopicsData[1]);
					topic3 = await createTopic(device.id, defaultDeviceTopicsData[2]);
					topic4 = await createTopic(device.id, defaultDeviceTopicsData[3]);

					logger.log("info", `Default device topics has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default device topics could not be created: %s`, err.message);
				}

				const sensorsData: CreateSensorDto[] = [];
				const dashboarsId: number[] = [];
				const sensorsUid: string[] = [];
				sensorsData[0] =
				{
					assetId: asset.id,
					description: `Temperature sensor`,
					topicId: topic1.id,
					payloadKey: "temperature",
					paramLabel: "Temperature",
					valueType: "number",
					units: "°C",
					dashboardRefresh: "1s",
					dashboardTimeWindow: "5m"
				};
				sensorsUid[0] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[1] =
				{
					assetId: asset.id,
					description: `Mobile accelerations`,
					topicId: topic2.id,
					payloadKey: "mobile_accelerations",
					paramLabel: "ax,ay,az",
					valueType: "number(3)",
					units: "m/s^2",
					dashboardRefresh: "200ms",
					dashboardTimeWindow: "25s"
				};
				sensorsUid[1] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[2] =
				{
					assetId: asset.id,
					description: `Mobile quaternions`,
					topicId: topic3.id,
					payloadKey: "mobile_quaternion",
					paramLabel: "q0,q1,q2,q3",
					valueType: "number(4)",
					units: "-",
					dashboardRefresh: "200ms",
					dashboardTimeWindow: "25s"
				};
				sensorsUid[2] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[3] =
				{
					assetId: asset.id,
					description: `Mobile photo`,
					topicId: topic4.id,
					payloadKey: "mobile_photo",
					paramLabel: "mobile_photo",
					valueType: "string",
					units: "-",
					dashboardRefresh: "1s",
					dashboardTimeWindow: "5m"
				};
				sensorsUid[3] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				try {
					dashboarsId[0] = await createSensorDashboard(group, sensorsData[0], sensorsUid[0]);
					dashboarsId[1] = await createSensorDashboard(group, sensorsData[1], sensorsUid[1]);
					dashboarsId[2] = await createSensorDashboard(group, sensorsData[2], sensorsUid[2]);
					dashboarsId[3] = await createSensorDashboard(group, sensorsData[3], sensorsUid[3]);
				} catch (err) {
					logger.log("error", `Default sensors dashboards could not be created: %s`, err.message);
				}

				try {
					await createNewSensor(sensorsData[0], dashboarsId[0], sensorsUid[0]);
					await createNewSensor(sensorsData[1], dashboarsId[1], sensorsUid[1]);
					await createNewSensor(sensorsData[2], dashboarsId[2], sensorsUid[2]);
					await createNewSensor(sensorsData[3], dashboarsId[3], sensorsUid[3]);
					logger.log("info", `Default sensors for main group has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default sensors for main group can not be created: %s`, err.message);
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
					await postgresClient.query(queryStringtableRefreshToken);
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
					await postgresClient.query(queryStringAlterAlertNotification);
					logger.log("info", `Foreing key in table ${tableAlertNotification} has been added sucessfully`);
				} catch (err) {
					logger.log("error", `Foreing key in table ${tableAlertNotification} couldd not be added: %s`, err.message);
				}

				pool.end(() => {
					logger.log("info", `Postgres migration pool has ended`);
				})

				timescaledb_pool.end(() => {
					logger.log("info", `Timescaldb migration pool has ended`);
				})
			} else {
				try {
					const queryViews = `SELECT table_name from INFORMATION_SCHEMA.views WHERE table_schema = 'iot_datasource';`;
					const result = await timescaledbClient.query(queryViews);
					if (result.rows.length === 0) {
						const orgs = await getOrganizations();
						const dataSourceQueries = [];
						for (const org of orgs) {
							if (org.id === 1) continue;
							const query = createTimescaledbOrgDataSource(org.id);
							dataSourceQueries.push(query);
						}
						await Promise.all(dataSourceQueries);

						const groups = await getAllGroups();
						const createViewsQueries = [];
						for (const group of groups) {
							const query = createView(group);
							createViewsQueries.push(query);
						}
						await Promise.all(createViewsQueries);
					}

				} catch (err) {
					logger.log("error", `Views in timescaledb could not be checked: %s`, err.message);
					process.exit(1);
				}
			}
		}
	} else {
		process.exit(1);
	}

}
