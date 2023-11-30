import { logger } from "../config/winston";
import { Pool } from "pg";
import fs from "fs";
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
import { createHomeDashboard } from "../components/group/dashboardDAL";
import IGroup from "../components/group/interfaces/Group.interface";
import { RoleInGroupOption } from "../components/group/interfaces/RoleInGroupOptions";
import needle from "needle";
import { createFictitiousUserForService } from "../components/user/userDAL";
import INodeRedInstance from "../components/nodeRedInstance/nodeRedInstance.interface";
import {
	assignNodeRedInstanceToGroup,
	createNodeRedInstancesInOrg,
	updateGroupNodeRedInstanceLocation
} from "../components/nodeRedInstance/nodeRedInstanceDAL";
import s3Client from "../config/s3Config";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
	getOrganizations
} from "../components/organization/organizationDAL";
import { createTimescaledbOrgDataSource } from "../components/group/datasourceDAL";
import IAsset from "../components/asset/asset.interface";
import {
	createNewAsset,
	createNewAssetType,
	updateGroupAssetsLocation
} from "../components/asset/assetDAL";
import { createNewSensorType } from "../components/sensor/sensorDAL";;
import { nanoid } from "nanoid";
import {
	createDigitalTwin,
	uploadMobilePhoneGltfFile
} from "../components/digitalTwin/digitalTwinDAL";
import IAssetType from "../components/asset/assetType.interface";
import { predefinedAssetTypes } from "./predefinedAssetTypes";
import { emptyBucket } from "./emptyS3Bucket";
import IFloor from "../components/building/floor.interface";
import {
	findBuildingBounds,
	findGeographicCoordinates,
	findGroupGeojsonData
} from "../utils/geolocation.ts/geolocation";
import ISensorType from "../components/sensor/sensorType.interface";
import { predefinedSensorTypes } from "./predefinedSensorTypes";
import process_env from "../config/api_config";

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
	if (process_env.S3_BUCKET_TYPE !== "Cloud AWS S3") {
		const minioUrl = `minio:9000/minio/health/live`;
		await needle('get', minioUrl)
			.then(() => "ok")
			.catch(err => {
				logger.log("error", "Minio service is not healthy: %s", err.message)
				process.exit(1);
			});
	}

	if (timescaledbClient && postgresClient && grafanaState === "ok") {
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
				try {
					const listBucketsResult = await s3Client.send(new ListBucketsCommand({}));
					const bucketName = process_env.S3_BUCKET_NAME;
					existPlatformS3Bucket = listBucketsResult.Buckets.filter(bucket => bucket.Name === bucketName).length !== 0;
					if (!existPlatformS3Bucket) {
						await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
						logger.log("info", `The S3 bucket for the platform has been created successfully`)
					} else {
						logger.log("info", `An S3 bucket with the name ${bucketName} already has been created`);
						await emptyBucket();
					}
				} catch (err) {
					logger.log("error", "The S3 bucket for the platform can not be created: %s", err)
					process.exit(1);
				}

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

				const queryStringUpdateOrg = `UPDATE grafanadb.org SET name = $1,  acronym = $2, role = $3, 
				                            building_id = $4, org_hash = $5,
											mqtt_access_control = $6 WHERE name = $7`;
				const parameterArrayUpdateOrg = [
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
					"Main",
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
					address VARCHAR(255),
					city VARCHAR(255),
					state VARCHAR(255),
					zip_code VARCHAR(50),
					country VARCHAR(255),
					outer_bounds float8[2][2],
					building_file_name VARCHAR(100),
					building_file_last_modif_date VARCHAR(100),
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

				const mainOrgBuildingGeoJson = "/run/configs/main_org_building.geojson";
				let geodataBuilding = "{}";
				if (fs.existsSync(mainOrgBuildingGeoJson)) {
					try {
						geodataBuilding = fs.readFileSync(mainOrgBuildingGeoJson, { encoding: 'utf8', flag: 'r' });
					} catch (err) {
						logger.log("error", `An error occurred while trying to read the file: ${mainOrgBuildingGeoJson}:  %s`, err.message);
					}
				}
				const buildingOuterBounds = findBuildingBounds(geodataBuilding);
				const [buildingLongitude, buildingLatitude] = findGeographicCoordinates(geodataBuilding);

				const queryStringInsertBuilding =
					`INSERT INTO ${tableBuilding} 
					(name, address, city, state, zip_code, country,
					geoData, outer_bounds, geolocation,
					building_file_name, building_file_last_modif_date,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`;
				const queryParametersInsertBuilding = [
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ADDRESS1,
					process_env.MAIN_ORGANIZATION_CITY,
					process_env.MAIN_ORGANIZATION_STATE,
					process_env.MAIN_ORGANIZATION_ZIP_CODE,
					process_env.MAIN_ORGANIZATION_COUNTRY,
					geodataBuilding,
					buildingOuterBounds,
					`(${buildingLongitude},${buildingLatitude})`,
					"building_1.geojson",
					(new Date()).toISOString(),
				];
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
					floor_file_name VARCHAR(100),
					floor_file_last_modif_date VARCHAR(100),
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

				const mainOrgFloorGeoJson = "/run/configs/main_org_floor.geojson";
				let geodataFloor = "{}";
				if (fs.existsSync(mainOrgFloorGeoJson)) {
					try {
						geodataFloor = fs.readFileSync(mainOrgFloorGeoJson, { encoding: 'utf8', flag: 'r' });
					} catch (err) {
						logger.log("error", `An error occurred while trying to read the file: ${mainOrgFloorGeoJson}:  %s`, err.message);
					}
				}

				const queryStringInsertFloor =
					`INSERT INTO ${tableFloor} 
					(building_id, floor_number, geodata, floor_file_name, 
					floor_file_last_modif_date, created, updated)
					VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
					RETURNING  id, 
					building_id AS "buildingId",
					floor_number AS "floorNumber",
					geodata AS "geoJsonData",
					outer_bounds AS "outerBounds",
					floor_file_name AS "floorFileName",
					floor_file_last_modif_date AS "floorFileLastModifDate",
					AGE(NOW(), floor.created) AS "createdAtAge",
					AGE(NOW(), floor.updated) AS "updatedAtAge"`;
				const queryParametersInsertFloor = [
					1,
					0,
					geodataFloor,
					"Floor_0_of_building_1.geojson",
					(new Date()).toISOString(),
				];
				let floor: IFloor;
				try {
					const response = await postgresClient.query(queryStringInsertFloor, queryParametersInsertFloor);
					floor = response.rows[0];
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
					mqtt_password VARCHAR(255),
					mqtt_salt VARCHAR(40),
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
						featureIndex: 1,
						outerBounds: [] as number[][],
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
					await addMembersToGroup(group, [groupMember]);
					logger.log("info", `Table ${tableGroup} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableGroup} can not be created: %s`, err.message);
				}

				const tableSensorType = "grafanadb.sensor_type";
				const queryStringSensorType = `
				CREATE TABLE IF NOT EXISTS ${tableSensorType}(
					id serial PRIMARY KEY,
					org_id bigint,
					sensor_type_uid VARCHAR(40) UNIQUE,
					type VARCHAR(40),
					icon_svg_file_name VARCHAR(100),
					icon_svg_string TEXT,
					marker_svg_file_name VARCHAR(100),
					marker_svg_string TEXT,
					default_payload_json_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
					is_predefined boolean NOT NULL DEFAULT FALSE,
					dashboard_refresh_string VARCHAR(20),
					dashboard_time_window VARCHAR(20),
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					UNIQUE(org_id,type),
					CONSTRAINT fk_org_id
						FOREIGN KEY(org_id)
							REFERENCES grafanadb.org(id)
							ON DELETE CASCADE			
				);

				CREATE INDEX IF NOT EXISTS idx_sensor_type_uid
				ON grafanadb.sensor_type(sensor_type_uid);`;

				try {
					await postgresClient.query(queryStringSensorType);
					logger.log("info", `Table ${tableSensorType} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableSensorType} can not be created: %s`, err.message);
				}

				const sensorTypes: ISensorType[] = [];
				try {
					for (const sensorType of predefinedSensorTypes) {
						const defaultSensorTypeData = {
							orgId: 1,
							type: sensorType.type,
							iconSvgFileName: sensorType.iconSvgFileName,
							iconSvgString: sensorType.iconSvgString,
							markerSvgFileName: sensorType.markerSvgFileName,
							markerSvgString: sensorType.markerSvgString,
							defaultPayloadJsonSchema: JSON.stringify(sensorType.defaultPayloadJsonSchema),
							isPredefined: true,
							dashboardRefreshString: sensorType.dashboardRefreshString,
							dashboardTimeWindow: sensorType.dashboardTimeWindow
						}
						const newSensorType = await createNewSensorType(defaultSensorTypeData);
						sensorTypes.push(newSensorType);
					}
					logger.log("info", `Default sensor types for main org has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default sensor types for main org can not be created: %s`, err.message);
				}

				const tableAssetType = "grafanadb.asset_type";
				const queryStringAssetType = `
				CREATE TABLE IF NOT EXISTS ${tableAssetType}(
					id serial PRIMARY KEY,
					org_id bigint,
					asset_type_uid VARCHAR(40) UNIQUE,
					type VARCHAR(40),
					icon_svg_file_name VARCHAR(100),
					icon_svg_string TEXT,
					geolocation_mode VARCHAR(40) NOT NULL DEFAULT 'static',
					marker_svg_file_name VARCHAR(100),
					marker_svg_string TEXT,
					asset_state_format jsonb NOT NULL DEFAULT '{}'::jsonb,
					is_predefined boolean NOT NULL DEFAULT FALSE,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					UNIQUE(org_id,type),
					CONSTRAINT fk_org_id
						FOREIGN KEY(org_id)
							REFERENCES grafanadb.org(id)
							ON DELETE CASCADE			
				);

				CREATE INDEX IF NOT EXISTS idx_asse_type_uid
				ON grafanadb.asset_type(asset_type_uid);`;

				try {
					await postgresClient.query(queryStringAssetType);
					logger.log("info", `Table ${tableAssetType} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableAssetType} can not be created: %s`, err.message);
				}

				const assetTypes: IAssetType[] = [];
				try {
					for (const assetType of predefinedAssetTypes as IAssetType[]) {
						const defaultAssetTypeData = {
							orgId: 1,
							type: assetType.type,
							iconSvgFileName: assetType.iconSvgFileName,
							iconSvgString: assetType.iconSvgString,
							geolocationMode: assetType.geolocationMode,
							markerSvgFileName: assetType.markerSvgFileName,
							markerSvgString: assetType.markerSvgString,
							assetStateFormat: "{}",
							isPredefined: true,
						}
						const newAssetType = await createNewAssetType(defaultAssetTypeData);
						assetTypes.push(newAssetType);
					}
					logger.log("info", `Default asset types for main org has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default asset types for main org can not be created: %s`, err.message);
				}

				const tableAsset = "grafanadb.asset";
				const queryStringAsset = `
				CREATE TABLE IF NOT EXISTS ${tableAsset}(
					id serial PRIMARY KEY,
					group_id bigint,
					asset_uid VARCHAR(40) UNIQUE,
					asset_type_id bigint,
					description VARCHAR(190),
					geolocation POINT,
					icon_radio real NOT NULL DEFAULT 1.0,
					icon_size_factor real NOT NULL DEFAULT 1.0,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE,
					CONSTRAINT fk_asset_type_id
						FOREIGN KEY(asset_type_id)
							REFERENCES grafanadb.asset_type(id)
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

				const tableTopic = "grafanadb.topic";
				const queryStringTopic = `
				CREATE TABLE IF NOT EXISTS ${tableTopic}(
					id serial PRIMARY KEY,
					group_id bigint,
					topic_type VARCHAR(40),
					description VARCHAR(190),
					topic_uid VARCHAR(40) UNIQUE,
					payload_json_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
					mqtt_access_control VARCHAR(10),
					require_s3_storage boolean NOT NULL DEFAULT FALSE,
					s3_folder VARCHAR(190) NOT NULL DEFAULT '',
					last_s3_storage TIMESTAMPTZ,
					parquet_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
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

				const tableAssetTopic = "grafanadb.asset_topic";
				const queryStringAssetTopic = `
				CREATE TABLE IF NOT EXISTS ${tableAssetTopic}(
					asset_id bigint,
					topic_id bigint,
					topic_ref VARCHAR(40),
					UNIQUE (asset_id, topic_ref),
					CONSTRAINT fk_asset_id
						FOREIGN KEY(asset_id)
						REFERENCES grafanadb.asset(id)
						ON DELETE CASCADE,
					CONSTRAINT fk_topic_id
						FOREIGN KEY(topic_id)
						REFERENCES grafanadb.topic(id)
						ON DELETE CASCADE		
				);`;

				try {
					await postgresClient.query(queryStringAssetTopic);
					logger.log("info", `Table ${tableAssetTopic} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableAssetType} can not be created: %s`, err.message);
				}

				const tableSensor = "grafanadb.sensor";
				const queryStringSensor = `
				CREATE TABLE IF NOT EXISTS ${tableSensor}(
					id serial PRIMARY KEY,
					asset_id bigint,
					sensor_uid VARCHAR(40) UNIQUE,
					sensor_type_id bigint,
					sensor_ref VARCHAR(20),
					topic_id bigint,
					description VARCHAR(190),
					dashboard_id bigint,
					dashboard_url VARCHAR(255),
					payload_json_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					UNIQUE (asset_id, sensor_ref),
					CONSTRAINT fk_asset_id
						FOREIGN KEY(asset_id)
							REFERENCES grafanadb.asset(id)
								ON DELETE CASCADE,
					CONSTRAINT fk_sensor_type_id
						FOREIGN KEY(sensor_type_id)
							REFERENCES grafanadb.sensor_type(id)
								ON DELETE CASCADE,															
					CONSTRAINT fk_dashboard_id
						FOREIGN KEY(dashboard_id)
							REFERENCES grafanadb.dashboard(id)
							 	ON DELETE CASCADE,
					CONSTRAINT fk_sensor_topic_id
						FOREIGN KEY(topic_id)
							REFERENCES grafanadb.topic(id)
							  	ON DELETE CASCADE
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
					group_id bigint,
					asset_id bigint,
					scope VARCHAR(10) NOT NULL DEFAULT 'Asset',
					digital_twin_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190),
					type VARCHAR(40),
					dashboard_id bigint,
					max_num_resfem_files SMALLINT NOT NULL DEFAULT 1,
					digital_twin_simulation_format jsonb NOT NULL DEFAULT '{}'::jsonb,
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					UNIQUE (group_id, asset_id, scope),
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE,
					CONSTRAINT fk_asset_id
						FOREIGN KEY(asset_id)
							REFERENCES grafanadb.asset(id)
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
					topic_ref VARCHAR(40),
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

				const tableDigitalTwinSensor = "grafanadb.digital_twin_sensor";
				const queryStringDigitalTwinSensor = `
				CREATE TABLE IF NOT EXISTS ${tableDigitalTwinSensor}(
					digital_twin_id bigint,
					sensor_id bigint,
					CONSTRAINT fk_digital_twin_id
						FOREIGN KEY(digital_twin_id)
						REFERENCES grafanadb.digital_twin(id)
						ON DELETE CASCADE,
					CONSTRAINT fk_sensor_id
						FOREIGN KEY(sensor_id)
						REFERENCES grafanadb.sensor(id)
						ON DELETE CASCADE
				);`;

				try {
					await postgresClient.query(queryStringDigitalTwinSensor);
					logger.log("info", `Table ${tableDigitalTwinSensor} has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Table ${tableDigitalTwinSensor} can not be created: %s`, err.message);
				}

				const tableMLModel = "grafanadb.ml_model";
				const queryStringMLModel = `
				CREATE TABLE IF NOT EXISTS ${tableMLModel}(
					id serial PRIMARY KEY,
					group_id bigint,
					ml_model_uid VARCHAR(40) UNIQUE,
					description VARCHAR(190) UNIQUE,
					ml_library VARCHAR(40),
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

				let asset: IAsset;
				try {
					const defaultAssetData = {
						assetTypeId: assetTypes[5].id,
						description: `Mobile for group ${group.acronym}`,
						type: "Mobile",
						iconRadio: 1.0,
						iconSizeFactor: 1.0,
						longitude: 0.0,
						latitude: 0.0,
						geolocationMode: "dynamic",
						topicsRef: [
							{
								topicRef: "dev2pdb_1",
								topicType: "dev2pdb_wt",
								description: `Mobile geolocation topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[0].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "dev2pdb_2",
								topicType: "dev2pdb_wt",
								description: `Mobile accelerations topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[1].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "dev2pdb_3",
								topicType: "dev2pdb_wt",
								description: `Mobile orientation topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[2].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "dev2pdb_4",
								topicType: "dev2pdb_wt",
								description: `Mobile motion topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[3].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "dev2pdb_5",
								topicType: "dev2dtm",
								description: `Mobile photo topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[4].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							}
						],
						sensorsRef: [
							{
								sensorRef: "sensor_1",
								sensorType: "Mobile geolocation",
								topicRef: "dev2pdb_1",
								description: `Mobile geolocation`,
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[0].defaultPayloadJsonSchema),
							},
							{
								sensorRef: "sensor_2",
								sensorType: "Mobile accelerations",
								topicRef: "dev2pdb_2",
								description: `Mobile accelerations`,
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[1].defaultPayloadJsonSchema),
							},
							{
								sensorRef: "sensor_3",
								sensorType: "Mobile orientation",
								topicRef: "dev2pdb_3",
								description: `Mobile orientation`,
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[2].defaultPayloadJsonSchema),
							},
							{
								sensorRef: "sensor_4",
								sensorType: "Mobile motion",
								topicRef: "dev2pdb_4",
								description: `Mobile motion`,
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[3].defaultPayloadJsonSchema),
							},
							{
								sensorRef: "sensor_5",
								sensorType: "Mobile photo",
								topicRef: "dev2pdb_5",
								description: `Mobile photo`,
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[4].defaultPayloadJsonSchema),
							}
						]
					}
					asset = await createNewAsset(group, defaultAssetData);
					logger.log("info", `Default asset for main group has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default asset for main group can not be created: %s`, err.message);
				}

				try {
					const geoJsonDataString = findGroupGeojsonData(floor, 1);
					await updateGroupAssetsLocation(geoJsonDataString, group);
					await updateGroupNodeRedInstanceLocation(geoJsonDataString, group);
					logger.log("info", `Updapting geolocation for asset in group with id: ${group.id}`);
				} catch (err) {
					logger.log("error", `Update of group assets with id: ${group.id} could not be performed: %s`, err.message);
				}

				const digitalTwinData = {
					description: "Mobile phone default DT",
					type: "Gltf 3D model",
					digitalTwinUid: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
					maxNumResFemFiles: 1,
					digitalTwinSimulationFormat: "{}",
					sensorsRef: ["sensor_3"]
				}

				try {
					const digitalTwin = await createDigitalTwin(group, asset, digitalTwinData);
					const keyBase = `org_1/group_${group.id}/digitalTwin_${digitalTwin.id}`;
					const gltfFileName = `${keyBase}/gltfFile/mobile_phone.gltf`
					await uploadMobilePhoneGltfFile(gltfFileName);
					logger.log("info", `Default mobile phone digital twin has been created sucessfully`);
				} catch (err) {
					logger.log("error", `Default mobile phone digital twin can not be created: %s`, err.message);
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
