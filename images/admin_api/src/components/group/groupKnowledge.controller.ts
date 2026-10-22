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

// Knowledge base of a group (RAG)
//
// The documents a group's administrators upload here are shared by all
// the group's AI agents: pipelines indexes them (text, chunks and
// embeddings in patroni_admin's rag schema) when it receives the
// knowledgeFile messages published below, and the agents search them
// with the search-knowledge tool.
//
// They live in the bucket under org_data/org_<org>/group_<group>/knowledge/.

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
				uploadKnowledgeFile.single("file"),
				this.uploadKnowledgeFile
			)
			.get(`${this.path}_file_list/:groupId`, groupExists, groupAdminAuth, this.getKnowledgeFileList)
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
			// File names without the folder, as the other endpoints take them.
			const files = list.map((f) => ({ ...f, fileName: f.fileName.slice(folder.length + 1) }));
			res.status(200).send(files);
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
