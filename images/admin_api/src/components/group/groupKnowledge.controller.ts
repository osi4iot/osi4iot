import { Router, NextFunction, Response } from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import type { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import IController from "../../interfaces/controller.interface";
import groupExists from "../../middleware/groupExists.middleware";
import { groupAdminAuth } from "../../middleware/auth.middleware";
import HttpException from "../../exceptions/HttpException";
import IRequestWithGroup from "./interfaces/requestWithGroup.interface";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import natsClient from "../../config/natsConfig";
import infoLogger from "../../utils/logger/infoLogger";
import { deleteBucketFile, getBucketFolderInfoFileList } from "../digitalTwin/digitalTwinDAL";
import pool from "../../config/dbconfig";
import { logger } from "../../config/winston";
import {
	deleteKnowledgeDocument,
	isRagEnabledForGroup,
	normalizeKnowledgeTitle,
	syncKnowledgeDocuments,
	updateKnowledgeDocumentTitle,
	upsertKnowledgeDocument,
} from "./knowledgeDAL";

// Knowledge base of a group (RAG)
//
// The documents a group's administrators upload here are shared by all
// the group's AI agents: pipelines indexes them (text, chunks and
// embeddings in patroni_admin's rag schema) when it receives the
// knowledgeFile messages published below, and the agents search them
// with the search-knowledge tool.
//
// They live in the bucket under org_data/org_<org>/group_<group>/knowledge/,
// and each one has a row in grafanadb.knowledge_document with its title
// (optional; the file name is shown without one). Each digital twin
// chooses which of them its agents may read (none unless chosen).
//
// The knowledge base is off unless enabled for the organization and for
// the group: then documents cannot be uploaded (the ones there can still
// be listed, retitled, downloaded and deleted) and pipelines does not
// index them.

const KNOWLEDGE_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB, as pipelines reads at most

// What pipelines can index: text, PDF (with a text layer) and Word .docx.
const KNOWLEDGE_EXTENSIONS = [
	".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".xml", ".yaml", ".yml",
	".html", ".htm", ".rst", ".pdf", ".docx",
];

export const knowledgeFolder = (orgId: number, groupId: number | string): string =>
	`org_data/org_${orgId}/group_${groupId}/knowledge`;

// A plain file name: no path, nothing hidden, a supported extension.
const isValidKnowledgeFileName = (fileName: string): boolean => {
	if (!fileName || fileName.length > 200) return false;
	if (/[/\\]/.test(fileName) || fileName.startsWith(".") || fileName.includes("..")) return false;
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x1f]/.test(fileName)) return false;
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0) return false;
	return KNOWLEDGE_EXTENSIONS.includes(fileName.slice(dot).toLowerCase());
};

const validKnowledgeFileName = (req: IRequestWithGroup, res: Response, next: NextFunction): void => {
	const { fileName } = req.params;
	if (!isValidKnowledgeFileName(fileName)) {
		return next(
			new HttpException(
				req,
				res,
				400,
				`Invalid file name. Use a plain file name with one of: ${KNOWLEDGE_EXTENSIONS.join(", ")}`
			)
		);
	}
	next();
};

// Uploading needs the knowledge base enabled for the organization and the group.
const ragEnabled = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
	try {
		if (!(await isRagEnabledForGroup(req.group))) {
			return next(
				new HttpException(
					req,
					res,
					400,
					"The knowledge base is not enabled for this group. It must be enabled for its organization and for the group."
				)
			);
		}
		next();
	} catch (error) {
		next(error);
	}
};

const uploadKnowledgeFile = multer({
	limits: { fileSize: KNOWLEDGE_MAX_FILE_SIZE, files: 1 },
	storage: multerS3({
		s3: s3Client,
		bucket: process_env.S3_BUCKET_NAME,
		metadata: (req, file, cb) => {
			cb(null, { fieldName: file.fieldname });
		},
		key: (req: IRequestWithGroup, file, cb) => {
			const { groupId, fileName } = req.params;
			cb(null, `${knowledgeFolder(req.group.orgId, groupId)}/${fileName}`);
		},
	}),
});

interface IKnowledgeDocumentRow {
	s3_key: string;
	status: string;
	num_chunks: number;
	error: string | null;
}

// How far pipelines got indexing each of the group's documents (its
// rag.documents table, in the same database), by S3 key. null when there
// is no knowledge database: the platform runs without Patroni, or
// pipelines has not created its tables yet.
const getKnowledgeIndexingStatus = async (groupId: number): Promise<Map<string, IKnowledgeDocumentRow> | null> => {
	const exists = await pool.query<{ exists: boolean }>(
		"SELECT to_regclass('rag.documents') IS NOT NULL AS exists"
	);
	if (!exists.rows[0]?.exists) return null;
	const result = await pool.query<IKnowledgeDocumentRow>(
		"SELECT s3_key, status, num_chunks, error FROM rag.documents WHERE group_id = $1",
		[groupId]
	);
	return new Map(result.rows.map((row) => [row.s3_key, row]));
};

class GroupKnowledgeController implements IController {
	public path = "/group_knowledge";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.post(
				`${this.path}_upload_file/:groupId/:fileName`,
				groupExists,
				groupAdminAuth,
				validKnowledgeFileName,
				ragEnabled,
				uploadKnowledgeFile.single("file"),
				this.uploadKnowledgeFile
			)
			.get(`${this.path}_file_list/:groupId`, groupExists, groupAdminAuth, this.getKnowledgeFileList)
			.get(`${this.path}_enabled/:groupId`, groupExists, groupAdminAuth, this.getKnowledgeEnabled)
			.patch(
				`${this.path}_file_title/:groupId/:fileName`,
				groupExists,
				groupAdminAuth,
				validKnowledgeFileName,
				this.updateKnowledgeFileTitle
			)
			.get(
				`${this.path}_download_file/:groupId/:fileName`,
				groupExists,
				groupAdminAuth,
				validKnowledgeFileName,
				this.downloadKnowledgeFile
			)
			.delete(
				`${this.path}_delete_file/:groupId/:fileName`,
				groupExists,
				groupAdminAuth,
				validKnowledgeFileName,
				this.deleteKnowledgeFile
			);
	}

	private uploadKnowledgeFile = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		const { fileName } = req.params;
		try {
			// The title comes in the query string (?title=...): optional; a
			// file uploaded again keeps its title when none is given.
			const title = req.query.title === undefined ? undefined : normalizeKnowledgeTitle(req.query.title);
			await upsertKnowledgeDocument(req.group.id, fileName, title);
			// pipelines indexes it (again, if it replaces a file of the same name).
			await natsClient.jsPublish("knowledgeFile", "create", req.group.id, { groupId: req.group.id, fileName });
			const message = `The file ${fileName} has been uploaded to the group's knowledge base`;
			infoLogger(req, res, 200, message);
			res.status(200).send({ message });
		} catch (error) {
			next(error);
		}
	};

	private getKnowledgeFileList = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const folder = knowledgeFolder(req.group.orgId, req.group.id);
			const list = await getBucketFolderInfoFileList(folder);
			// The list is still useful without the indexing status: a failure
			// reading it (e.g. no permission on the rag schema) is logged and
			// the documents are shown with status "unknown".
			let indexing: Map<string, IKnowledgeDocumentRow> | null | undefined;
			try {
				indexing = await getKnowledgeIndexingStatus(req.group.id);
			} catch (err) {
				logger.log("error", `Knowledge indexing status of group ${req.group.id}: ${(err as Error).message}`);
				indexing = undefined;
			}
			// File names without the folder, as the other endpoints take them.
			const fileNames = list.map((f) => f.fileName.slice(folder.length + 1));
			const titles = await syncKnowledgeDocuments(req.group.id, fileNames);
			const files = list.map((f, index) => {
				const doc = indexing?.get(f.fileName);
				return {
					...f,
					fileName: fileNames[index],
					title: titles.get(fileNames[index]) ?? "",
					// "pending": uploaded, not picked up by pipelines yet;
					// "disabled": the platform has no knowledge database.
					status:
						indexing === undefined ? "unknown" : indexing ? (doc?.status ?? "pending") : "disabled",
					numChunks: doc?.num_chunks ?? 0,
					error: doc?.error ?? "",
				};
			});
			res.status(200).send(files);
		} catch (error) {
			next(error);
		}
	};

	private getKnowledgeEnabled = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			res.status(200).send({ enabled: await isRagEnabledForGroup(req.group) });
		} catch (error) {
			next(error);
		}
	};

	private updateKnowledgeFileTitle = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const { fileName } = req.params;
		try {
			const title = normalizeKnowledgeTitle((req.body as { title?: unknown })?.title);
			if (!(await updateKnowledgeDocumentTitle(req.group.id, fileName, title))) {
				throw new HttpException(req, res, 404, `The file ${fileName} is not in the group's knowledge base`);
			}
			const message = `The title of the file ${fileName} has been updated`;
			infoLogger(req, res, 200, message);
			res.status(200).send({ message });
		} catch (error) {
			next(error);
		}
	};

	private downloadKnowledgeFile = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		const { fileName } = req.params;
		try {
			const data = await s3Client.send(
				new GetObjectCommand({
					Bucket: process_env.S3_BUCKET_NAME,
					Key: `${knowledgeFolder(req.group.orgId, req.group.id)}/${fileName}`,
				})
			);
			res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
			if (data.ContentType) res.setHeader("Content-Type", data.ContentType);
			(data.Body as Readable).pipe(res);
		} catch (error) {
			next(error);
		}
	};

	private deleteKnowledgeFile = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		const { fileName } = req.params;
		try {
			await deleteBucketFile(`${knowledgeFolder(req.group.orgId, req.group.id)}/${fileName}`);
			// Also removes it from the digital twins that had it.
			await deleteKnowledgeDocument(req.group.id, fileName);
			await natsClient.jsPublish("knowledgeFile", "delete", req.group.id, { groupId: req.group.id, fileName });
			const message = `The file ${fileName} has been deleted from the group's knowledge base`;
			infoLogger(req, res, 200, message);
			res.status(200).send({ message });
		} catch (error) {
			next(error);
		}
	};
}

export default GroupKnowledgeController;
