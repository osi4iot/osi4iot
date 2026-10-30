import pool from "../../config/dbconfig";
import IGroup from "./interfaces/Group.interface";
import { getOrganizationByProp } from "../organization/organizationDAL";

// Knowledge bases (RAG) in admin_api's tables: see
// initialization/migration.ts.

export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;

// The knowledge base of a group is on when it is enabled for its
// organization and for the group.
export const isRagEnabledForGroup = async (group: IGroup): Promise<boolean> => {
	if (!group.ragEnabled) return false;
	const org = await getOrganizationByProp("id", group.orgId);
	return org?.ragEnabled === true;
};

export const normalizeKnowledgeTitle = (title: unknown): string =>
	typeof title === "string" ? title.trim().replace(/\s+/g, " ").slice(0, KNOWLEDGE_TITLE_MAX_LENGTH) : "";

// An uploaded document: its row, with its title when one is given (a file
// uploaded again keeps its title unless a new one is given).
export const upsertKnowledgeDocument = async (groupId: number, fileName: string, title?: string): Promise<void> => {
	await pool.query(
		`INSERT INTO grafanadb.knowledge_document (group_id, file_name, title)
		VALUES ($1, $2, COALESCE($3, ''))
		ON CONFLICT (group_id, file_name) DO UPDATE
			SET title = COALESCE($3, grafanadb.knowledge_document.title), updated = NOW()`,
		[groupId, fileName, title ?? null]
	);
};

export const updateKnowledgeDocumentTitle = async (groupId: number, fileName: string, title: string): Promise<boolean> => {
	const result = await pool.query(
		`UPDATE grafanadb.knowledge_document SET title = $3, updated = NOW()
		WHERE group_id = $1 AND file_name = $2`,
		[groupId, fileName, title]
	);
	return (result.rowCount ?? 0) !== 0;
};

// Deleting the row removes the document from the digital twins that had it.
export const deleteKnowledgeDocument = async (groupId: number, fileName: string): Promise<void> => {
	await pool.query("DELETE FROM grafanadb.knowledge_document WHERE group_id = $1 AND file_name = $2", [
		groupId,
		fileName,
	]);
};

// The rows follow the files in the bucket, which are the truth: a file
// without a row (uploaded before the titles existed) gets one with no
// title, a row without a file goes.
export const syncKnowledgeDocuments = async (groupId: number, fileNames: string[]): Promise<Map<string, string>> => {
	await pool.query(
		`INSERT INTO grafanadb.knowledge_document (group_id, file_name)
		SELECT $1, f FROM unnest($2::text[]) AS f
		ON CONFLICT (group_id, file_name) DO NOTHING`,
		[groupId, fileNames]
	);
	await pool.query(
		`DELETE FROM grafanadb.knowledge_document
		WHERE group_id = $1 AND NOT (file_name = ANY($2::text[]))`,
		[groupId, fileNames]
	);
	const result = await pool.query<{ file_name: string; title: string }>(
		"SELECT file_name, title FROM grafanadb.knowledge_document WHERE group_id = $1",
		[groupId]
	);
	return new Map(result.rows.map((row) => [row.file_name, row.title]));
};

// The documents a digital twin's AI agents may read. Names that are not
// documents of its group are ignored.
export const setDigitalTwinKnowledgeDocuments = async (digitalTwinId: number, fileNames: string[]): Promise<void> => {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("DELETE FROM grafanadb.digital_twin_knowledge_document WHERE digital_twin_id = $1", [
			digitalTwinId,
		]);
		await client.query(
			`INSERT INTO grafanadb.digital_twin_knowledge_document (digital_twin_id, group_id, file_name)
			SELECT dt.id, kd.group_id, kd.file_name
			FROM grafanadb.digital_twin dt
			INNER JOIN grafanadb.knowledge_document kd ON kd.group_id = dt.group_id
			WHERE dt.id = $1 AND kd.file_name = ANY($2::text[])
			ON CONFLICT DO NOTHING`,
			[digitalTwinId, fileNames]
		);
		await client.query("COMMIT");
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}
};
