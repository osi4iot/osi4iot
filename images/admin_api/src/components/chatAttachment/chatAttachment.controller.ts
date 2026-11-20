import { Router, NextFunction, Response } from "express";
import multer from "multer";
import type { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import IController from "../../interfaces/controller.interface";
import digitalTwinAndGroupExist from "../../middleware/digitalTwinAndGroupExist.middleware";
import { groupMemberAuth } from "../../middleware/auth.middleware";
import HttpException from "../../exceptions/HttpException";
import IRequestWithDigitalTwinAndGroup from "../group/interfaces/requestWithDigitalTwinAndGroup.interface";
import IUser from "../user/interfaces/User.interface";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import infoLogger from "../../utils/logger/infoLogger";
import {
	areChatAttachmentsAllowed,
	chatAttachmentContentType,
	chatAttachmentsRetentionDays,
	chatAttachmentsUserFolder,
	CHAT_ATTACHMENT_MAX_SIZE,
	CHAT_ATTACHMENT_TEXT_MAX_SIZE,
	CHAT_ATTACHMENT_TYPES,
	cleanChatAttachmentName,
	isValidChatAttachmentFile,
	sniffChatAttachmentType,
	chatAttachmentMaxSize,
} from "./chatAttachmentDAL";

// Files attached to the chat of a digital twin (see chatAttachmentDAL.ts). Any member of the group may attach
// files to the chat of its digital twins and read the ones they attached; nobody reads the files of another
// user here (the key is built with the login of whoever asks).

interface IRequestChatAttachment extends IRequestWithDigitalTwinAndGroup {
	user?: IUser;
}

const uploadChatAttachment = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: CHAT_ATTACHMENT_MAX_SIZE, files: 1 },
});

// The digital twin is the group's and has its chat assistant on
const chatOfTheGroup = (req: IRequestChatAttachment, res: Response, next: NextFunction): void => {
	if (req.digitalTwin?.groupId !== req.group?.id) {
		return next(new HttpException(req, res, 404, "The digital twin is not in this group."));
	}
	if (!req.digitalTwin?.chatAssistantEnabled) {
		return next(new HttpException(req, res, 400, "The chat assistant of this digital twin is not enabled."));
	}
	next();
};

// multer's own errors (e.g. a file too large) as a message for the user
const receiveFile = (req: IRequestChatAttachment, res: Response, next: NextFunction): void => {
	uploadChatAttachment.single("file")(req, res, (err: unknown) => {
		if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
			return next(
				new HttpException(req, res, 413, `The file is larger than ${CHAT_ATTACHMENT_MAX_SIZE / (1024 * 1024)} MB.`)
			);
		}
		if (err) return next(err);
		next();
	});
};

class ChatAttachmentController implements IController {
	public path = "/chat_attachment";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}_enabled/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupMemberAuth,
				chatOfTheGroup,
				this.getEnabled
			)
			.post(
				`${this.path}_upload/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupMemberAuth,
				chatOfTheGroup,
				receiveFile,
				this.upload
			)
			.get(
				`${this.path}_file/:groupId/:digitalTwinId/:date/:fileName`,
				digitalTwinAndGroupExist,
				groupMemberAuth,
				chatOfTheGroup,
				this.download
			);
	}

	private getEnabled = async (req: IRequestChatAttachment, res: Response, next: NextFunction): Promise<void> => {
		try {
			res.status(200).send({
				enabled: await areChatAttachmentsAllowed(req.group),
				maxSize: CHAT_ATTACHMENT_MAX_SIZE,
				textMaxSize: CHAT_ATTACHMENT_TEXT_MAX_SIZE,
				types: Object.keys(CHAT_ATTACHMENT_TYPES),
				retentionDays: chatAttachmentsRetentionDays(),
			});
		} catch (error) {
			next(error);
		}
	};

	private upload = async (req: IRequestChatAttachment, res: Response, next: NextFunction): Promise<void> => {
		try {
			if (!(await areChatAttachmentsAllowed(req.group))) {
				throw new HttpException(
					req,
					res,
					400,
					"Chat attachments are not enabled for this group: a group administrator can enable them (they need the LLM enabled)."
				);
			}
			const file = req.file;
			if (!file?.buffer?.length) {
				throw new HttpException(req, res, 400, "No file was received.");
			}
			const contentType = sniffChatAttachmentType(file.buffer, file.originalname);
			if (!contentType) {
				throw new HttpException(
					req,
					res,
					415,
					"Only images (JPEG, PNG, WebP), documents (PDF, Word .docx, text .txt or Markdown .md, in UTF-8) and tables (CSV, Excel .xlsx) can be attached."
				);
			}
			if (file.buffer.length > chatAttachmentMaxSize(contentType)) {
				throw new HttpException(req, res, 413, `A text file can have at most ${chatAttachmentMaxSize(contentType) / (1024 * 1024)} MB.`);
			}
			const date = new Date().toISOString().slice(0, 10);
			const fileName = `${date}/${nanoid(20)}.${CHAT_ATTACHMENT_TYPES[contentType]}`;
			const folder = chatAttachmentsUserFolder(req.group.orgId, req.group.id, req.digitalTwin.id, req.user.login);
			await s3Client.send(
				new PutObjectCommand({
					Bucket: process_env.S3_BUCKET_NAME,
					Key: `${folder}/${fileName}`,
					Body: file.buffer,
					ContentType: contentType,
				})
			);
			const attachment = {
				file: fileName,
				name: cleanChatAttachmentName(
					file.originalname,
					`${contentType.startsWith("image/") ? "image" : "document"}.${CHAT_ATTACHMENT_TYPES[contentType]}`
				),
				mimeType: contentType,
				size: file.buffer.length,
			};
			infoLogger(req, res, 200, `Chat attachment ${fileName} of digital twin ${req.digitalTwin.id} uploaded`);
			res.status(200).send(attachment);
		} catch (error) {
			next(error);
		}
	};

	private download = async (req: IRequestChatAttachment, res: Response, next: NextFunction): Promise<void> => {
		try {
			const file = `${req.params.date}/${req.params.fileName}`;
			if (!isValidChatAttachmentFile(file)) {
				throw new HttpException(req, res, 400, "Invalid attachment name.");
			}
			const folder = chatAttachmentsUserFolder(req.group.orgId, req.group.id, req.digitalTwin.id, req.user.login);
			let body: Readable;
			try {
				const object = await s3Client.send(
					new GetObjectCommand({ Bucket: process_env.S3_BUCKET_NAME, Key: `${folder}/${file}` })
				);
				body = object.Body as Readable;
			} catch {
				throw new HttpException(req, res, 404, "The attachment does not exist (attachments are deleted after some days).");
			}
			const contentType = chatAttachmentContentType(file);
			// a CSV may be Windows-1252 (as Excel saves it): no charset for it
			res.setHeader("Content-Type", contentType.startsWith("text/") && contentType !== "text/csv" ? `${contentType}; charset=utf-8` : contentType);
			res.setHeader("Cache-Control", "private, max-age=86400");
			res.setHeader("X-Content-Type-Options", "nosniff");
			// what a user attached never runs as a page of this site (a PDF's scripts, HTML in a text)
			res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
			res.setHeader("Content-Disposition", contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment");
			body.on("error", next);
			body.pipe(res);
		} catch (error) {
			next(error);
		}
	};
}

export default ChatAttachmentController;
