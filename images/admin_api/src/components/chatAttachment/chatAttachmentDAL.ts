// Files attached to the chat of a digital twin (photos from the phone, the computer or Telegram).
//
// They are kept in the bucket, under the folder of the user who sent them:
//
//   org_data/org_<org>/group_<group>/chat_attachments/dt_<digitalTwin>/user_<hash of the login>/<YYYY-MM-DD>/<id>.<ext>
//
// The message of the chat (sim2llm) carries only "<YYYY-MM-DD>/<id>.<ext>": admin_api (here) and pipelines
// (utils/chatAttachments.go) build the rest of the key themselves, from the group, the digital twin and the
// user that the platform knows, so a message can never point to the files of another user, digital twin or
// group. The user folder is a hash of the login so that no login appears in the bucket (pipelines computes the
// same hash: keep both in step).
//
// They may be sent to the organization's LLM provider only when the group allows it
// (group.chat_attachments_enabled, off by default) and the LLM is enabled for the organization and the group.
// They are deleted after CHAT_ATTACHMENTS_RETENTION_DAYS (30 by default).
import crypto from "crypto";
import { DeleteObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import pool from "../../config/dbconfig";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import { logger } from "../../config/winston";
import IGroup from "../group/interfaces/Group.interface";
import { getOrganizationByProp } from "../organization/organizationDAL";

export const CHAT_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB: a photo of the phone at full resolution, a PDF
// a text file is read whole by the AI agent: smaller
export const CHAT_ATTACHMENT_TEXT_MAX_SIZE = 1024 * 1024;

// What can be attached: images, documents (PDF, Word, text, Markdown) of a moderate length (pipelines refuses
// the long ones: they belong to the group's knowledge base) and tables (CSV, Excel .xlsx: the AI agent queries them
// with the chat_data MCP server). The type is checked from the content of the file, not from what the browser says.
export const CHAT_ATTACHMENT_TYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"application/pdf": "pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	"text/plain": "txt",
	"text/markdown": "md",
	"text/csv": "csv",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const chatAttachmentMaxSize = (contentType: string): number =>
	contentType.startsWith("text/") && contentType !== "text/csv" ? CHAT_ATTACHMENT_TEXT_MAX_SIZE : CHAT_ATTACHMENT_MAX_SIZE;

const DEFAULT_RETENTION_DAYS = 30;

export const chatAttachmentsRetentionDays = (): number => {
	const days = Number(process.env.CHAT_ATTACHMENTS_RETENTION_DAYS);
	return Number.isInteger(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
};

// The user folder: the first 24 hex characters of the SHA-256 of the login (as pipelines' ChatAttachmentUserFolder)
export const chatAttachmentUserFolder = (login: string): string =>
	`user_${crypto.createHash("sha256").update(login, "utf8").digest("hex").slice(0, 24)}`;

export const chatAttachmentsGroupFolder = (orgId: number, groupId: number): string =>
	`org_data/org_${orgId}/group_${groupId}/chat_attachments`;

export const chatAttachmentsUserFolder = (orgId: number, groupId: number, digitalTwinId: number, login: string): string =>
	`${chatAttachmentsGroupFolder(orgId, groupId)}/dt_${digitalTwinId}/${chatAttachmentUserFolder(login)}`;

// "<YYYY-MM-DD>/<id>.<ext>": the only part of the key a message carries
const ATTACHMENT_FILE_RE = /^(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9_-]{8,40})\.(jpg|png|webp|pdf|docx|txt|md|csv|xlsx)$/;

export const isValidChatAttachmentFile = (file: string): boolean => ATTACHMENT_FILE_RE.test(file);

export const chatAttachmentContentType = (file: string): string => {
	const ext = file.slice(file.lastIndexOf(".") + 1);
	return Object.keys(CHAT_ATTACHMENT_TYPES).find((type) => CHAT_ATTACHMENT_TYPES[type] === ext) ?? "application/octet-stream";
};

const isUtf8Text = (data: Buffer): boolean => {
	if (data.includes(0)) return false;
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(data);
		return true;
	} catch {
		return false;
	}
};

// The type of a file from its content (and, for text and Word, the extension of its name too); null when it is
// not one of the accepted ones
export const sniffChatAttachmentType = (data: Buffer, name = ""): string | null => {
	if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
	if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return "image/png";
	}
	if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp";
	}
	if (data.length >= 5 && data.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
	const ext = name.toLowerCase().split(".").pop() ?? "";
	// a .docx is a zip with word/document.xml (the names of a zip are not compressed)
	if (ext === "docx" && data.length >= 4 && data.toString("binary", 0, 4) === "PK\x03\x04" && data.includes("word/document.xml")) {
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	}
	if (ext === "xlsx" && data.length >= 4 && data.toString("binary", 0, 4) === "PK\x03\x04" && data.includes("xl/workbook.xml")) {
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	}
	// a CSV: UTF-8, or Windows-1252 as Excel saves it in Spain (chat_data converts it)
	if (ext === "csv" && data.length > 0 && !data.includes(0)) return "text/csv";
	if ((ext === "txt" || ext === "md" || ext === "markdown") && isUtf8Text(data)) return ext === "txt" ? "text/plain" : "text/markdown";
	return null;
};

// A file name to show (the one of the user's device): no path, no control characters, at most 120 characters
export const cleanChatAttachmentName = (name: unknown, fallback: string): string => {
	if (typeof name !== "string") return fallback;
	// eslint-disable-next-line no-control-regex
	const base = name.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, "").trim() ?? "";
	return base ? base.slice(0, 120) : fallback;
};

// Groups of older versions: the column of the setting (every replica, before serving)
export const ensureGroupChatAttachmentsColumn = async (): Promise<void> => {
	await pool.query(
		"ALTER TABLE grafanadb.group ADD COLUMN IF NOT EXISTS chat_attachments_enabled BOOLEAN NOT NULL DEFAULT false"
	);
};

// Whether the files attached to the chat of the group's digital twins may be sent to the LLM provider: the
// group allows it and the LLM is enabled for the group and its organization
export const areChatAttachmentsAllowed = async (group: IGroup): Promise<boolean> => {
	if (group.chatAttachmentsEnabled !== true || group.llmEnabled !== true) return false;
	const org = await getOrganizationByProp("id", group.orgId);
	return org?.llmEnabled === true;
};

// Deletes the attachments older than the retention period, in every group. Returns how many it deleted.
export const deleteExpiredChatAttachments = async (retentionDays: number): Promise<number> => {
	const groups = await pool.query<{ id: number; org_id: number }>("SELECT id, org_id FROM grafanadb.group");
	const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
	let deleted = 0;
	for (const group of groups.rows) {
		const prefix = `${chatAttachmentsGroupFolder(group.org_id, group.id)}/`;
		let token: string | undefined;
		do {
			const page: ListObjectsV2CommandOutput = await s3Client.send(
				new ListObjectsV2Command({ Bucket: process_env.S3_BUCKET_NAME, Prefix: prefix, ContinuationToken: token })
			);
			const old = (page.Contents ?? [])
				.filter((object) => object.Key && object.LastModified && object.LastModified.getTime() < cutoff)
				.map((object) => object.Key );
			// one by one: DeleteObjects needs a checksum that Garage does not take as AWS sends it
			// (as pipelines' DeleteS3Prefix)
			for (const key of old) {
				await s3Client.send(new DeleteObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: key }));
				deleted++;
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
		} while (token);
	}
	return deleted;
};

// Runs deleteExpiredChatAttachments now and then every 24 hours (only one replica runs it)
export const scheduleChatAttachmentsCleanup = (): void => {
	const run = async (): Promise<void> => {
		const days = chatAttachmentsRetentionDays();
		try {
			const deleted = await deleteExpiredChatAttachments(days);
			if (deleted > 0) logger.log("info", `Chat attachments older than ${days} days deleted: ${deleted}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", "The old chat attachments could not be deleted: %s", message);
		}
	};
	void run();
	setInterval(() => void run(), 24 * 3600 * 1000).unref();
};
