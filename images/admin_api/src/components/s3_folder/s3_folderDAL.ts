import pool, { readQuery } from "../../config/dbconfig";
import { removeFilesFromBucketFolder } from "../digitalTwin/digitalTwinDAL";
import CreateS3FolderDto from "./s3_folder.dto";
import IS3Folder from "./s3_folder.interface";
import UpdateS3FolderParquetSchemaDto from "./s3_folderParquetSchemaUpdate.dto";
import archiver from "archiver";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { logger } from "../../config/winston";
import UpdateS3FolderParquetStatsDto from "./s3_folderParquetStatsUpdate.dto";
import natsClient from "../../config/natsConfig";

export const insertS3Folder = async (
	groupId: number,
	assetId: number,
	s3FolderData: CreateS3FolderDto
): Promise<IS3Folder> => {
	const result = await pool.query(
		`INSERT INTO grafanadb.s3_folder (group_id, asset_id, folderName, parquet_schema, created, updated)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", asset_id AS "assetId", folderName, 
		parquet_schema AS "parquetSchema", last_s3_storage AS "lastS3Storage",
		created, updated`,
		[groupId, assetId, s3FolderData.folderName, JSON.stringify(s3FolderData.parquetSchema)]
	);

	const context = {
		groupId,
		assetId,
	};
	await natsClient.jsPublish("s3_folder", "create", result.rows[0].id, context);
	return result.rows[0] as IS3Folder;
};

export const updateS3FolderParquetSchemaById = async (
	id: number,
	s3FolderData: UpdateS3FolderParquetSchemaDto
): Promise<IS3Folder> => {
	const result = await pool.query(
		`SELECT * FROM grafanadb.update_s3_folder(
		p_id             => $1,
		p_parquet_schema => $2::jsonb
	);`,
		[id, JSON.stringify(s3FolderData.parquetSchema)]
	);

	const groupId = result.rows[0].group_id;
	const assetId = result.rows[0].asset_id;
	const context = {
		groupId,
		assetId,
		updatedField: "parquet_schema",
	};
	await natsClient.jsPublish("s3_folder", "update", result.rows[0].id, context);
	return result.rows[0] as IS3Folder;
};

export const updateS3FolderParquetStatsById = async (
	id: number,
	s3FolderData: UpdateS3FolderParquetStatsDto
): Promise<IS3Folder> => {
	const result = await pool.query(
		`SELECT * FROM grafanadb.update_s3_folder(
			p_id              => $1,
			p_parquet_schema  => NULL::jsonb,
			p_last_s3_storage => $2::TIMESTAMPTZ,
			p_file_count      => $3,
			p_total_bytes     => $4
		);`,
		[id, s3FolderData.lastS3Storage, s3FolderData.parquetFileCount, s3FolderData.parquetTotalBytes]
	);

	const groupId = result.rows[0].group_id;
	const assetId = result.rows[0].asset_id;
	const context = {
		groupId,
		assetId,
		updatedField: "parquet_file_stats",
	};
	await natsClient.jsPublish("s3_folder", "update", result.rows[0].id, context);
	return result.rows[0] as IS3Folder;
};

export const getS3FolderByProp = async (
	assetId: number,
	propName: string,
	propValue: string | number
): Promise<IS3Folder> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.asset_id = $1 AND grafanadb.s3_folder.${propName} = $2 
		AND grafanadb.s3_folder.is_current = true;`,
		[assetId, propValue]
	);

	return result.rows[0] as IS3Folder;
};

export const getAllS3Folders = async (): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.is_current = true`
	);

	return result.rows as IS3Folder[];
};

export const getAllS3FoldersWithHistory = async (): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id`
	);

	return result.rows as IS3Folder[];
};

export const getS3FoldersByGroupsIdArray = async (groupsIdArray: number[]): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.group_id = ANY($1) AND grafanadb.s3_folder.is_current = true`,
		[groupsIdArray]
	);

	return result.rows as IS3Folder[];
};

export const getS3FoldersWithHistoryByGroupsIdArray = async (groupsIdArray: number[]): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.group_id = ANY($1)`,
		[groupsIdArray]
	);

	return result.rows as IS3Folder[];
};

export const getS3FoldersByOrgId = async (orgId: number): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.group.org_id = $1 AND grafanadb.s3_folder.is_current = true`,
		[orgId]
	);

	return result.rows as IS3Folder[];
};

export const getS3FoldersByGroupId = async (groupId: number): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.group_id = $1 AND grafanadb.s3_folder.is_current = true`,
		[groupId]
	);

	return result.rows as IS3Folder[];
};

export const getS3FoldersByAssetId = async (groupId: number, assetId: number): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.group_id = $1 AND grafanadb.s3_folder.asset_id = $2 AND grafanadb.s3_folder.is_current = true`,
		[groupId, assetId]
	);

	return result.rows as IS3Folder[];
};

export const getS3FolderHistoryByName = async (
	groupId: number,
	assetId: number,
	folderName: string
): Promise<IS3Folder[]> => {
	const result = await readQuery(
		`SELECT grafanadb.s3_folder.id,
		grafanadb.group.org_id AS "orgId",
		grafanadb.s3_folder.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.s3_folder.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.s3_folder.folderName AS "folderName",
		grafanadb.s3_folder.parquet_schema AS "parquetSchema",
		grafanadb.s3_folder.last_s3_storage AS "lastS3Storage",
		grafanadb.s3_folder.parquet_file_count AS "parquetFileCount",
		grafanadb.s3_folder.parquet_total_bytes AS "parquetTotalBytes",
		grafanadb.s3_folder.version AS "version",
		grafanadb.s3_folder.is_current AS "isCurrent",
		grafanadb.s3_folder.valid_from AS "validFrom",
		grafanadb.s3_folder.valid_to AS "validTo",
		grafanadb.s3_folder.created, grafanadb.s3_folder.updated
		FROM grafanadb.s3_folder
		INNER JOIN grafanadb.group ON grafanadb.s3_folder.group_id = grafanadb.group.id
		INNER JOIN grafanadb.asset ON grafanadb.s3_folder.asset_id = grafanadb.asset.id
		WHERE grafanadb.s3_folder.group_id = $1 AND grafanadb.s3_folder.asset_id = $2 AND grafanadb.s3_folder.folderName = $3
		ORDER BY version DESC`,
		[groupId, assetId, folderName]
	);

	return result.rows as IS3Folder[];
};

export const deleteFoldersInS3Bucket = async (s3Folders: IS3Folder[]): Promise<void> => {
	if (s3Folders.length === 0) return;
	const deletePromises = s3Folders.map((s3Folder) => {
		const orgId = s3Folder.orgId;
		const groupId = s3Folder.groupId;
		const assetId = s3Folder.assetId;
		const folderName = s3Folder.folderName;
		const folderPath = `org_${orgId}/group_${groupId}/asset_${assetId}/folder=${folderName}`;
		return removeFilesFromBucketFolder(folderPath);
	});
	await Promise.all(deletePromises);
};

export const deleteS3FoldersByName = async (groupId: number, assetId: number, folderName: string): Promise<void> => {
	await pool.query(
		`DELETE FROM grafanadb.s3_folder
		WHERE group_id = $1 AND asset_id = $2 AND folderName = $3`,
		[groupId, assetId, folderName]
	);
};

export const generateZipFileStream = (files: { key: string; fileName: string }[]) => {
	const archive = archiver("zip", { zlib: { level: 5 } });

	const processFiles = async () => {
		for (const file of files) {
			try {
				const command = new GetObjectCommand({
					Bucket: process_env.S3_BUCKET_NAME,
					Key: file.key,
				});
				const response = await s3Client.send(command);
				const stream = response.Body as Readable;
				archive.append(stream, { name: file.fileName });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", `Error appending file ${file.key} to zip: %s`, message);
			}
		}
		await archive.finalize();
	};

	// Kick off async processing without blocking the return
	processFiles().catch((err) => archive.emit("error", err));

	return archive;
};

export const getBucketFolderFileNames = async (
	folderName: string,
	initDate: string, // format: YYYY-MM-DD
	finalDate: string, // format: YYYY-MM-DD
	s3Folders: IS3Folder[]
): Promise<{ key: string; fileName: string }[]> => {
	const bucketName = process_env.S3_BUCKET_NAME;
	const allFiles: { key: string; fileName: string }[] = [];

	const start = new Date(initDate);
	const end = new Date(finalDate);
	const zipFileName = `${folderName}_${initDate}_${finalDate}`;

	for (const folder of s3Folders) {
		const { orgId, groupId, assetId, version } = folder;

		// Iterate day by day between initDate and finalDate
		const current = new Date(start);
		while (current <= end) {
			const YYYY = current.getFullYear();
			const MM = String(current.getMonth() + 1).padStart(2, "0");
			const DD = String(current.getDate()).padStart(2, "0");

			const prefix = `org_${orgId}/group_${groupId}/asset_${assetId}/folder=${folderName}/version=${version}/year=${YYYY}/month=${MM}/day=${DD}/`;

			const bucketParams = {
				Bucket: bucketName,
				Prefix: prefix,
			};

			const command = new ListObjectsV2Command(bucketParams);

			try {
				let isTruncated = true;
				while (isTruncated) {
					const data = await s3Client.send(command);
					if (data.Contents) {
						allFiles.push(
							...data.Contents.map((fileData) => {
								const key = fileData.Key; // org_X/group_X/asset_X/folder=X/version=X/year=YYYY/month=MM/day=DD/unix_ts.parquet
								const parts = key.split("/");

								// Extract path segments from the key
								const year = parts[5]; // "year=YYYY"
								const month = parts[6]; // "month=MM"
								const day = parts[7]; // "day=DD"
								const fileName = parts[8]; // "unix_ts.parquet"

								return {
									key,
									fileName: `${zipFileName}/version=${version}/${year}/${month}/${day}/${fileName}`,
								};
							})
						);
					}
					isTruncated = data.IsTruncated ?? false;
					command.input.ContinuationToken = data.NextContinuationToken;
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.log("error", `Files info list for prefix ${prefix} could not be obtained: %s`, message);
			}

			current.setDate(current.getDate() + 1);
		}
	}

	return allFiles;
};
