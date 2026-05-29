import { logger } from "../config/winston";
import { Pool } from "pg";
import fs from "fs";
import grafanaApi from "../GrafanaApi";
import { encrypt } from "../utils/encryptAndDecrypt/encryptAndDecrypt";
import {
	addMembersToGroup,
	createGroup,
	createView,
	defaultOrgGroupName,
	getAllGroups,
} from "../components/group/groupDAL";
import { FolderPermissionOption } from "../components/group/interfaces/FolerPermissionsOptions";
import { createHomeDashboard } from "../components/group/dashboardDAL";
import IGroup from "../components/group/interfaces/Group.interface";
import { RoleInGroupOption } from "../components/group/interfaces/RoleInGroupOptions";
import needle from "needle";
import s3Client from "../config/s3Config";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { getOrganizations } from "../components/organization/organizationDAL";
import { createTimescaledbOrgDataSource } from "../components/group/datasourceDAL";
import IAsset from "../components/asset/asset.interface";
import {
	createNewAsset,
	createNewAssetType,
	createSystemMonitoringAsset,
	updateGroupAssetsLocation,
} from "../components/asset/assetDAL";
import { createNewSensorType } from "../components/sensor/sensorDAL";
import { nanoid } from "nanoid";
import { createDigitalTwin, uploadMobilePhoneGltfFile } from "../components/digitalTwin/digitalTwinDAL";
import IAssetType from "../components/asset/assetType.interface";
import { predefinedAssetTypes, systemMonitoringAssetType } from "./predefinedAssetTypes";
import { emptyBucket } from "./emptyS3Bucket";
import IFloor from "../components/building/floor.interface";
import {
	findBuildingBounds,
	findFloorBounds,
	findGeographicCoordinates,
	findGroupGeojsonData,
} from "../utils/geolocation.ts/geolocation";
import ISensorType from "../components/sensor/sensorType.interface";
import { predefinedSensorTypes, systemMonitoringSensorTypes } from "./predefinedSensorTypes";
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
	const grafanaState = await needle("get", grafanaUrl)
		.then((res) => res.body.database as string)
		.catch((err) => {
			logger.log("error", "Grafana service is not healthy: %s", err.message);
			process.exit(1);
		});

	let existPlatformS3Bucket = false;
	if (process_env.S3_BUCKET_TYPE !== "Cloud AWS S3") {
		const minioUrl = `minio:9000/minio/health/live`;
		await needle("get", minioUrl)
			.then(() => "ok")
			.catch((err) => {
				logger.log("error", "Minio service is not healthy: %s", err.message);
				process.exit(1);
			});
	}

	if (timescaledbClient && postgresClient && grafanaState === "ok") {
		const tableOrg = "grafanadb.org";
		const queryString1a = "SELECT COUNT(*) FROM grafanadb.org WHERE name = $1";
		const parameterArray1a = ["Main Org."];
		let result0 = null;
		try {
			result0 = await postgresClient.query(queryString1a, parameterArray1a);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", `Table ${tableOrg} can not found: %s`, message);
			process.exit(1);
		}

		const tableThingData = "iot_data.thingData";
		const queryString2 = `SELECT '${tableThingData}'::regclass;`;
		try {
			await timescaledbClient.query(queryString2);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", `Table ${tableThingData} can not found in timescaledb: %s`, message);
			process.exit(1);
		}

		if (process_env.REPLICA === "1") {
			if (result0.rows[0].count !== 0) {
				try {
					const listBucketsResult = await s3Client.send(new ListBucketsCommand({}));
					const bucketName = process_env.S3_BUCKET_NAME;
					existPlatformS3Bucket =
						listBucketsResult.Buckets.filter((bucket) => bucket.Name === bucketName).length !== 0;
					if (!existPlatformS3Bucket) {
						await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
						logger.log("info", `The S3 bucket for the platform has been created successfully`);
					} else {
						logger.log("info", `An S3 bucket with the name ${bucketName} already has been created`);
						await emptyBucket();
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", "The S3 bucket for the platform can not be created: %s", message);
					process.exit(1);
				}

				const queryStringAlterOrg = `ALTER TABLE grafanadb.org
											ADD COLUMN acronym varchar(20) UNIQUE,
											ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'Generic',
											ADD COLUMN building_id bigint,
											ADD COLUMN org_hash varchar(20) UNIQUE,
											ADD COLUMN mqtt_access_control VARCHAR(10),
											ADD COLUMN llm_enabled BOOLEAN NOT NULL DEFAULT false,
											ADD COLUMN llm_provider_url VARCHAR(255),
											ADD COLUMN hashed_llm_provider_api_key TEXT,
											ADD COLUMN telegram_enabled BOOLEAN NOT NULL DEFAULT false,
											ADD COLUMN hashed_telegram_bot_token TEXT DEFAULT '',
											ADD COLUMN hashed_telegram_webhook_secret_token TEXT DEFAULT '';`;
				try {
					await postgresClient.query(queryStringAlterOrg);
					logger.log("info", `Column acronym has been added sucessfully to Table ${tableOrg}`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log(
						"error",
						`Column acronym can not be added sucessfully to Table ${tableOrg}: %s`,
						message
					);
				}

				const queryStringUpdateOrg = `UPDATE grafanadb.org SET name = $1,  acronym = $2, role = $3, 
				                            building_id = $4, org_hash = $5,
											mqtt_access_control = $6 WHERE name = $7`;
				const parameterArrayUpdateOrg = [
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_").toUpperCase(),
					"Main",
					1,
					nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
					"Pub & Sub",
					"Main Org.",
				];

				try {
					await postgresClient.query(queryStringUpdateOrg, parameterArrayUpdateOrg);
					logger.log("info", `Table ${tableOrg} has been updated sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableOrg} can not be updated: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableBuilding} can not be created: %s`, message);
				}

				const mainOrgBuildingGeoJson = "/run/configs/main_org_building.geojson";
				let geodataBuilding = "{}";
				if (fs.existsSync(mainOrgBuildingGeoJson)) {
					try {
						geodataBuilding = fs.readFileSync(mainOrgBuildingGeoJson, { encoding: "utf8", flag: "r" });
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						logger.log(
							"error",
							`An error occurred while trying to read the file: ${mainOrgBuildingGeoJson}:  %s`,
							message
						);
					}
				}
				const buildingOuterBounds = findBuildingBounds(geodataBuilding);
				const [buildingLongitude, buildingLatitude] = findGeographicCoordinates(geodataBuilding);

				const queryStringInsertBuilding = `INSERT INTO ${tableBuilding} 
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
					new Date().toISOString(),
				];
				try {
					await postgresClient.query(queryStringInsertBuilding, queryParametersInsertBuilding);
					logger.log("info", `Data in table ${tableBuilding} has been inserted sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Data in table ${tableBuilding} con not been inserted: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableFloor} can not be created: %s`, message);
				}

				const mainOrgFloorGeoJson = "/run/configs/main_org_floor.geojson";
				let geodataFloor = "{}";
				let floorOuterBounds: number[][];
				if (fs.existsSync(mainOrgFloorGeoJson)) {
					try {
						geodataFloor = fs.readFileSync(mainOrgFloorGeoJson, {
							encoding: "utf8",
							flag: "r",
						});
						floorOuterBounds = findFloorBounds(geodataFloor);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						logger.log(
							"error",
							`An error occurred while trying to read the file: ${mainOrgFloorGeoJson}:  %s`,
							message
						);
					}
				}

				const queryStringInsertFloor = `INSERT INTO ${tableFloor} 
					(building_id, floor_number, geodata, outer_bounds, floor_file_name, 
					floor_file_last_modif_date, created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
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
					floorOuterBounds,
					"Floor_0_of_building_1.geojson",
					new Date().toISOString(),
				];
				let floor: IFloor;
				try {
					const response = await postgresClient.query(queryStringInsertFloor, queryParametersInsertFloor);
					floor = response.rows[0];
					logger.log("info", `Data in table ${tableFloor} has been inserted sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Data in table ${tableFloor} con not been inserted: %s`, message);
				}

				const tableUser = "grafanadb.user";
				const queryStringAlterUser = `ALTER TABLE grafanadb.user
									ADD COLUMN first_name varchar(127) NOT NULL DEFAULT 'unknown',
									ADD COLUMN surname varchar(127) NOT NULL DEFAULT 'unknown',
									ADD COLUMN nats_nkey varchar(60) NOT NULL DEFAULT 'undefined';`;
				try {
					await postgresClient.query(queryStringAlterUser);
					logger.log(
						"info",
						`Columns first_name, surname, and nats_nkey have been added sucessfully to Table ${tableUser}`
					);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log(
						"error",
						`Columns first_name and surnanme can not be added sucessfully to Table ${tableUser}: %s`,
						message
					);
				}

				const plaformAdminUser = {
					id: 2,
					name: `${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
					firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
					surname: process_env.PLATFORM_ADMIN_SURNAME,
					email: process_env.PLATFORM_ADMIN_EMAIL,
					login: process_env.PLATFORM_ADMIN_USER_NAME,
					password: process_env.PLATFORM_ADMIN_PASSWORD,
					natsNkey: process_env.PLATFORM_ADMIN_NATS_PUBLIC,
					OrgId: 1,
				};
				await grafanaApi.createUser(plaformAdminUser);
				await grafanaApi.createOrgApiAdminUser(1);

				const queryStringUpdateUser =
					"UPDATE grafanadb.user SET first_name = $1, surname = $2, name = $3 WHERE id = $4";
				try {
					await postgresClient.query(queryStringUpdateUser, [
						process_env.PLATFORM_ADMIN_FIRST_NAME,
						process_env.PLATFORM_ADMIN_SURNAME,
						`${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
						2,
					]);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Platform admin user can not be updated: %s`, message);
				}
				await grafanaApi.giveGrafanaAdminPermissions(2);
				await grafanaApi.changeUserRoleInOrganization(1, 2, "Admin");

				let apiKeyMainOrg: string;
				try {
					const apyKeyName = `ApiKey_${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_")
						.replace(/"/g, "")
						.toUpperCase()}`;
					const apiKeyData = { name: apyKeyName, role: "Admin" };
					const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
					apiKeyMainOrg = apiKeyObj.key;
					logger.log("info", `Api key token created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Api key token created could not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableOrgToken} can not be created: %s`, message);
				}

				const queryStringInsertOrgToken = `INSERT INTO ${tableOrgToken} (org_id, api_key_id, organization_key) VALUES ($1, $2, $3)`;
				const hashedApiKey = encrypt(apiKeyMainOrg);
				const queryParametersInsertOrgToken = [1, 1, hashedApiKey];
				try {
					await postgresClient.query(queryStringInsertOrgToken, queryParametersInsertOrgToken);
					logger.log("info", `Data in table ${tableOrgToken} has been inserted sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Data in table ${tableOrgToken} con not been inserted: %s`, message);
				}

				let group: IGroup;
				const mainOrgGroupName = defaultOrgGroupName(
					process_env.MAIN_ORGANIZATION_NAME,
					process_env.MAIN_ORGANIZATION_ACRONYM
				);
				const mainOrgGroupAcronym = `${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_")
					.replace(/"/g, "")
					.toUpperCase()}_GRAL`;
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
					is_admin_group BOOLEAN DEFAULT false,
					floor_number integer NOT NULL DEFAULT 0,
					feature_index integer NOT NULL DEFAULT 0,
					outer_bounds float8[2][2],
					mqtt_access_control VARCHAR(10),
					mqtt_password VARCHAR(255),
					mqtt_salt VARCHAR(40),
					llm_enabled BOOLEAN DEFAULT false,
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
						email: process_env.PLATFORM_ADMIN_EMAIL,
					};
					const defaultMainOrgGroup = {
						name: mainOrgGroupName,
						acronym: mainOrgGroupAcronym,
						email: `${process_env.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_")
							.replace(/"/g, "")
							.toLocaleLowerCase()}_general@test.com`,
						telegramChatId: process_env.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
						telegramInvitationLink: process_env.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
						folderPermission: "Viewer" as FolderPermissionOption,
						groupAdminDataArray: [mainOrgGroupAdmin],
						floorNumber: 0,
						featureIndex: 1,
						outerBounds: [] as number[][],
						mqttAccessControl: "Pub & Sub",
						llmEnabled: false,
					};
					group = await createGroup(1, defaultMainOrgGroup, process_env.MAIN_ORGANIZATION_NAME, true, true);
					await createHomeDashboard(1, orgAcronym, orgName, group.folderId);
					const groupMember = {
						userId: 2,
						firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
						surname: process_env.PLATFORM_ADMIN_SURNAME,
						email: process_env.PLATFORM_ADMIN_EMAIL,
						roleInGroup: "Admin" as RoleInGroupOption,
					};
					await addMembersToGroup(group, [groupMember], true);
					logger.log("info", `Table ${tableGroup} has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableGroup} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableSensorType} can not be created: %s`, message);
				}

				const sensorTypes: ISensorType[] = [];
				try {
					const defaultSensorTypes = [...predefinedSensorTypes, ...systemMonitoringSensorTypes];
					for (const sensorType of defaultSensorTypes) {
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
							dashboardTimeWindow: sensorType.dashboardTimeWindow,
						};
						const newSensorType = await createNewSensorType(defaultSensorTypeData);
						sensorTypes.push(newSensorType);
					}
					logger.log("info", `Default sensor types for main org has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Default sensor types for main org can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableAssetType} can not be created: %s`, message);
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
						};
						const newAssetType = await createNewAssetType(defaultAssetTypeData);
						assetTypes.push(newAssetType);
					}
					const systemMonitoringAssetTypeData = {
						orgId: 1,
						type: "System monitoring",
						iconSvgFileName: systemMonitoringAssetType.iconSvgFileName,
						iconSvgString: systemMonitoringAssetType.iconSvgString,
						geolocationMode: systemMonitoringAssetType.geolocationMode,
						markerSvgFileName: systemMonitoringAssetType.markerSvgFileName,
						markerSvgString: systemMonitoringAssetType.markerSvgString,
						assetStateFormat: "{}",
						isPredefined: true,
					};
					const newSystemMonitoringAssetType = await createNewAssetType(systemMonitoringAssetTypeData);
					assetTypes.push(newSystemMonitoringAssetType);
					logger.log("info", `Default asset types for main org has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Default asset types for main org can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableAsset} can not be created: %s`, message);
				}

				const tableS3Folder = "grafanadb.s3_folder";
				const queryStringS3Folder = `
					CREATE TABLE IF NOT EXISTS ${tableS3Folder}(
						id                  serial       PRIMARY KEY,
						group_id            bigint,
						asset_id            bigint,
						folderName          VARCHAR(100)    NOT NULL DEFAULT 'telemetry',
						parquet_schema      jsonb           NOT NULL DEFAULT '{}'::jsonb,
						last_s3_storage     TIMESTAMPTZ,
						parquet_file_count  integer         NOT NULL DEFAULT 0,
						parquet_total_bytes bigint          NOT NULL DEFAULT 0,
						version             integer         NOT NULL DEFAULT 1,
						valid_from          TIMESTAMPTZ     NOT NULL DEFAULT now(),
						valid_to            TIMESTAMPTZ,            -- NULL = active row
						is_current          boolean         NOT NULL DEFAULT true,
						created             TIMESTAMPTZ     NOT NULL DEFAULT now(),
						updated             TIMESTAMPTZ,
						CONSTRAINT fk_group_id
							FOREIGN KEY (group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE,
						CONSTRAINT fk_asset_id
							FOREIGN KEY (asset_id)
							REFERENCES grafanadb.asset(id)
							ON DELETE CASCADE
					);

					-- Uniqueness only among ACTIVE rows (partial index)
					CREATE UNIQUE INDEX IF NOT EXISTS uq_s3_folder_active
						ON grafanadb.s3_folder(asset_id, folderName)
						WHERE is_current = true;

					-- Standard lookup index
					CREATE INDEX IF NOT EXISTS idx_s3_folderName
						ON grafanadb.s3_folder(asset_id, folderName);

					-- Index for historical range queries
					CREATE INDEX IF NOT EXISTS idx_s3_folder_valid
						ON grafanadb.s3_folder(asset_id, folderName, valid_from, valid_to);

					CREATE OR REPLACE FUNCTION grafanadb.scd2_s3_folder()
					RETURNS TRIGGER LANGUAGE plpgsql AS $$
					DECLARE
						v_new_id integer;
					BEGIN
						-- ── No schema change → plain UPDATE, no versioning ──────────
						IF OLD.parquet_schema IS NOT DISTINCT FROM NEW.parquet_schema THEN
							NEW.updated = now();
							RETURN NEW;
						END IF;

						-- 1. Close the current row
						UPDATE grafanadb.s3_folder
						SET
							valid_to   = now(),
							is_current = false,
							updated    = now()
						WHERE id = OLD.id;

						-- 2. Insert new version with counters reset to zero
						INSERT INTO grafanadb.s3_folder (
							group_id, asset_id, folderName, parquet_schema,
							last_s3_storage, parquet_file_count, parquet_total_bytes,
							version, valid_from, valid_to, is_current, created, updated
						) VALUES (
							NEW.group_id, NEW.asset_id, NEW.folderName, NEW.parquet_schema,
							NULL, 0, 0,  -- ← reset: aún no hay archivos en el nuevo esquema
							OLD.version + 1, now(), NULL,
							true, OLD.created, now()
						)
						RETURNING id INTO v_new_id;

						-- 3. Publish the new id
						PERFORM set_config('app.last_scd2_id', v_new_id::text, true);

						-- 4. Cancel the original UPDATE
						RETURN NULL;
					END;
					$$;

					CREATE OR REPLACE TRIGGER trg_scd2_s3_folder
						BEFORE UPDATE ON grafanadb.s3_folder
						FOR EACH ROW
						WHEN (OLD.is_current = true)
						EXECUTE FUNCTION grafanadb.scd2_s3_folder();

					CREATE OR REPLACE FUNCTION grafanadb.update_s3_folder(
						p_id                integer,
						p_parquet_schema    jsonb,
						p_last_s3_storage   TIMESTAMPTZ DEFAULT NULL,
						p_file_count        integer     DEFAULT NULL,
						p_total_bytes       bigint      DEFAULT NULL
					)
					RETURNS grafanadb.s3_folder LANGUAGE plpgsql AS $$
					DECLARE
						v_result    grafanadb.s3_folder;
						v_active_id integer;
					BEGIN
						-- Reset session variable before the operation
						PERFORM set_config('app.last_scd2_id', '', true);

						-- Fire the UPDATE; the trigger handles SCD2 logic internally
						UPDATE grafanadb.s3_folder
						SET
							parquet_schema      = COALESCE(p_parquet_schema, parquet_schema),
							last_s3_storage     = COALESCE(p_last_s3_storage, last_s3_storage),
							parquet_file_count  = COALESCE(p_file_count,      parquet_file_count),
							parquet_total_bytes = COALESCE(p_total_bytes,     parquet_total_bytes),
							updated             = now()
						WHERE id = p_id
						AND is_current = true;

						-- Resolve the active id:
						--   • SCD2 fired  → session variable holds the new row's id
						--   • No SCD2     → session variable is empty; use the original id
						v_active_id := NULLIF(current_setting('app.last_scd2_id', true), '')::integer;
						v_active_id := COALESCE(v_active_id, p_id);

						-- Fetch and return the active row
						SELECT * INTO v_result
						FROM grafanadb.s3_folder
						WHERE id = v_active_id;

						-- Clean up session variable
						PERFORM set_config('app.last_scd2_id', '', true);

						RETURN v_result;
					END;
					$$;
				`;

				try {
					await postgresClient.query(queryStringS3Folder);
					logger.log("info", `Table ${tableS3Folder} has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableS3Folder} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableTopic} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableAssetTopic} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableSensor} can not be created: %s`, message);
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
					chat_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE,
					chat_assistant_language VARCHAR(20) NOT NULL DEFAULT 'none',
					digital_twin_simulation_format jsonb NOT NULL DEFAULT '{}'::jsonb,
					pipeline_file_name VARCHAR(100) NOT NULL DEFAULT '-',
					pipeline_file_last_modif_date VARCHAR(100) NOT NULL DEFAULT '-',
					pipeline_file_data TEXT NOT NULL DEFAULT '',
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableDigitalTwin} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableDigitalTwinTopic} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableDigitalTwinSensor} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableMLModel} can not be created: %s`, message);
				}

				let mobileSensorsAsset: IAsset;
				let systemMonitoringAsset: IAsset;
				try {
					const systemMonitoringAssetData = {
						assetTypeId: assetTypes[predefinedAssetTypes.length].id,
						description: `System monitoring for main group`,
						type: "system_monitoring",
						iconRadio: 1.0,
						iconSizeFactor: 1.0,
						longitude: 0.0,
						latitude: 0.0,
						geolocationMode: "dynamic",
						topicsRef: [
							{
								topicRef: "system_1",
								topicType: "system",
								description: "Log entries",
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: "{}",
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "system_2",
								topicType: "system",
								description: "Host metrics",
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: "{}",
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "system_3",
								topicType: "system",
								description: "Container metrics",
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: "{}",
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "system_4",
								topicType: "system",
								description: "Volume metrics",
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: "{}",
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
							{
								topicRef: "system_5",
								topicType: "system",
								description: "System alert",
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: "{}",
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
						],
						sensorsRef: [
							{
								sensorRef: "sensor_1",
								sensorType: "Service logs",
								topicRef: "system_1",
								description: "Log entries sensor",
								payloadJsonSchema: "{}",
							},
							{
								sensorRef: "sensor_2",
								sensorType: "Host metrics",
								topicRef: "system_2",
								description: "Host metrics sensor",
								payloadJsonSchema: "{}",
							},
							{
								sensorRef: "sensor_3",
								sensorType: "Container metrics",
								topicRef: "system_3",
								description: "Container metrics sensor",
								payloadJsonSchema: "{}",
							},
							{
								sensorRef: "sensor_4",
								sensorType: "Volume metrics",
								topicRef: "system_4",
								description: "Volume metrics sensor",
								payloadJsonSchema: "{}",
							},
						],
					};
					systemMonitoringAsset = await createSystemMonitoringAsset(group, systemMonitoringAssetData, true);
					logger.log("info", `System monitoring asset for main group has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Default asset for main group can not be created: %s`, message);
				}

				try {
					const mobileSensorsAssetData = {
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
							},
							{
								topicRef: "dev2pdb_6",
								topicType: "dev2dtm",
								description: `Mobile video topic`,
								mqttAccessControl: "Pub & Sub",
								payloadJsonSchema: JSON.stringify(predefinedSensorTypes[5].defaultPayloadJsonSchema),
								requireS3Storage: false,
								s3Folder: "",
								parquetSchema: "{}",
							},
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
								payloadJsonSchema: "{}",
							},
							{
								sensorRef: "sensor_6",
								sensorType: "Mobile video",
								topicRef: "dev2pdb_6",
								description: `Mobile video`,
								payloadJsonSchema: "{}",
							},
						],
					};
					mobileSensorsAsset = await createNewAsset(group, mobileSensorsAssetData, true);
					logger.log("info", `Default asset for main group has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Default asset for main group can not be created: %s`, message);
				}

				try {
					const geoJsonDataString = findGroupGeojsonData(floor, 1);
					await updateGroupAssetsLocation(geoJsonDataString, group);
					logger.log("info", `Updapting geolocation for asset in group with id: ${group.id}`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log(
						"error",
						`Update of group assets with id: ${group.id} could not be performed: %s`,
						message
					);
				}

				const systemMonitoringDigitalTwinData = {
					description: "System monitoring",
					type: "Grafana dashboard",
					digitalTwinUid: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
					maxNumResFemFiles: 0,
					digitalTwinSimulationFormat: "{}",
					chatAssistantEnabled: false,
					chatAssistantLanguage: "none",
					sensorsRef: [] as string[],
				};

				try {
					await createDigitalTwin(group, systemMonitoringAsset, systemMonitoringDigitalTwinData, null, true);
					logger.log("info", `System monitoring digital twin has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `System monitoring digital twin can not be created: %s`, message);
				}

				const mobileSensorsDigitalTwinData = {
					description: "Mobile phone default DT",
					type: "Gltf 3D model",
					digitalTwinUid: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
					maxNumResFemFiles: 1,
					digitalTwinSimulationFormat: "{}",
					chatAssistantEnabled: false,
					chatAssistantLanguage: "none",
					sensorsRef: ["sensor_3"],
				};

				try {
					const mobileSensorsDigitalTwin = await createDigitalTwin(
						group,
						mobileSensorsAsset,
						mobileSensorsDigitalTwinData,
						null,
						true
					);
					const keyBase = `org_1/group_${group.id}/digitalTwin_${mobileSensorsDigitalTwin.id}`;
					const gltfFileName = `${keyBase}/gltfFile/mobile_phone.gltf`;
					await uploadMobilePhoneGltfFile(gltfFileName);
					logger.log("info", `Default mobile phone digital twin has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Default mobile phone digital twin can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableRefreshToken} can not be created: %s`, message);
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log(
						"error",
						`Foreing key in table ${tableAlertNotification} couldd not be added: %s`,
						message
					);
				}

				const tableANatsService = "grafanadb.nats_service";
				const queryStringNatsService = `
				CREATE TABLE IF NOT EXISTS ${tableANatsService}(
					id serial PRIMARY KEY,
					svc_hash varchar(30) UNIQUE,
					group_id bigint,
					name VARCHAR(50),
					description VARCHAR(190),
					created TIMESTAMPTZ,
					updated TIMESTAMPTZ,
					CONSTRAINT fk_group_id
						FOREIGN KEY(group_id)
							REFERENCES grafanadb.group(id)
							ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_svc_hash
				ON grafanadb.nats_service(svc_hash);`;

				try {
					await postgresClient.query(queryStringNatsService);
					logger.log("info", `Table ${tableANatsService} has been created sucessfully`);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Table ${tableANatsService} could not be created: %s`, message);
				}

				pool.end(() => {
					logger.log("info", `Postgres migration pool has ended`);
				});

				timescaledb_pool.end(() => {
					logger.log("info", `Timescaldb migration pool has ended`);
				});
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
					const message = err instanceof Error ? err.message : String(err);
					logger.log("error", `Views in timescaledb could not be checked: %s`, message);
					process.exit(1);
				}
			}
		}
	} else {
		process.exit(1);
	}
};
