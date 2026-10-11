import { Router, NextFunction, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminAuth, organizationAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IS3Folder from "./s3_folder.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import infoLogger from "../../utils/logger/infoLogger";
import CreateS3FolderDto from "./s3_folder.dto";
import {
	getAllS3Folders,
	getS3FoldersByGroupsIdArray,
	getS3FolderByProp,
	getS3FoldersByOrgId,
	getS3FoldersByGroupId,
	getS3FoldersByAssetId,
	updateS3FolderParquetSchemaById,
	updateS3FolderParquetStatsById,
	insertS3Folder,
	getS3FolderHistoryByName,
	deleteS3FoldersByName,
	deleteFoldersInS3Bucket,
	generateZipFileStream,
	getBucketFolderFileNames,
	getAllS3FoldersWithHistory,
	getS3FoldersWithHistoryByGroupsIdArray,
} from "./s3_folderDAL";
import HttpException from "../../exceptions/HttpException";
import { generateS3StorageToken, isS3StorageTokenValid } from "../../utils/s3StorageToken";
import IRequestWithUserAndGroup from "../group/interfaces/requestWithUserAndGroup.interface";
import { getAssetByPropName } from "../asset/assetDAL";
import UpdateS3FolderParquetSchemaDto from "./s3_folderParquetSchemaUpdate.dto";
import UpdateS3FolderParquetStatsDto from "./s3_folderParquetStatsUpdate.dto";

class S3FolderController implements IController {
	public path = "/asset_s3_folder";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(`${this.path}s/user_managed/`, userAuth, this.getS3FoldersManagedByUser)
			.get(`${this.path}s_with_history/user_managed/`, userAuth, this.getS3FoldersWithHistoryManagedByUser)
			.get(`${this.path}s_in_org/:orgId/`, organizationAdminAuth, organizationExists, this.getS3FoldersInOrg)
			.get(`${this.path}s_in_group/:groupId`, groupExists, groupAdminAuth, this.getS3FoldersInGroup)
			.get(`${this.path}/:groupId/:assetId`, groupExists, groupAdminAuth, this.getS3FoldersInAsset)
			.get(
				`${this.path}/:groupId/:assetId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getS3FolderByProp
			)
			.get(
				`${this.path}s_history/:groupId/:assetId/:folderName`,
				groupExists,
				groupAdminAuth,
				this.getS3FoldersHistoryByFolderName
			)
			.get(
				`${this.path}_token/:groupId/:assetId/:folderName/:initDate/:finalDate`,
				groupExists,
				groupAdminAuth,
				this.getAssetS3StorageToken
			)
			.get(
				`${this.path}_download/:groupId/:assetId/:folderName/:initDate/:finalDate/:token`,
				groupExists,
				this.getAssetDataFromS3
			)
			.delete(
				`${this.path}/:groupId/:assetId/:folderName`,
				groupExists,
				groupAdminAuth,
				this.deleteS3FoldersByName
			)
			.patch(
				`${this.path}_parquet_schema/:groupId/:assetId/:folderName`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateS3FolderParquetSchemaDto>(UpdateS3FolderParquetSchemaDto, true),
				this.updateS3FolderParquetSchemaById
			)
			.patch(
				`${this.path}_parquet_stats/:groupId/:assetId/:folderName`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateS3FolderParquetStatsDto>(UpdateS3FolderParquetStatsDto, true),
				this.updateS3FolderParquetStatsById
			)
			.post(
				`${this.path}/:groupId/:assetId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateS3FolderDto>(CreateS3FolderDto, true),
				this.createS3Folder
			);
	}

	private getS3FoldersManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let s3Folders: IS3Folder[] = [];
			if (req.user.isGrafanaAdmin) {
				s3Folders = await getAllS3Folders();
			} else {
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
					s3Folders = await getS3FoldersByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(s3Folders);
		} catch (error) {
			next(error);
		}
	};

	private getS3FoldersWithHistoryManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let s3Folders: IS3Folder[] = [];
			if (req.user.isGrafanaAdmin) {
				s3Folders = await getAllS3FoldersWithHistory();
			} else {
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
					s3Folders = await getS3FoldersWithHistoryByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(s3Folders);
		} catch (error) {
			next(error);
		}
	};

	private getS3FoldersInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const orgId = req.params.orgId;
			const orgIdNum = parseInt(orgId, 10);
			if (isNaN(orgIdNum)) throw new InvalidPropNameExeception(req, res, "orgId");
			const s3Folders = await getS3FoldersByOrgId(orgIdNum);
			res.status(200).send(s3Folders);
		} catch (error) {
			next(error);
		}
	};

	private getS3FoldersInGroup = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupId = req.params.groupId;
			const groupIdNum = parseInt(groupId, 10);
			const s3Folders = await getS3FoldersByGroupId(groupIdNum);
			res.status(200).send(s3Folders);
		} catch (error) {
			next(error);
		}
	};

	private getS3FoldersInAsset = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { assetId } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			const groupId = req.params.groupId;
			const groupIdNum = parseInt(groupId, 10);
			const s3Folders = await getS3FoldersByAssetId(groupIdNum, assetIdNum);
			res.status(200).send(s3Folders);
		} catch (error) {
			next(error);
		}
	};

	private getS3FolderByProp = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { assetId, propName, propValue } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			if (!this.isValidS3FolderPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const s3Folder = await getS3FolderByProp(assetIdNum, propName, propValue);
			if (!s3Folder) throw new ItemNotFoundException(req, res, "The S3 folder", propName, propValue);
			res.status(200).json(s3Folder);
		} catch (error) {
			next(error);
		}
	};

	private getS3FoldersHistoryByFolderName = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { assetId, folderName } = req.params;

			const asset = await getAssetByPropName("id", assetId);
			if (!asset) throw new ItemNotFoundException(req, res, "The asset", "id", assetId);

			const group = req.group;
			const s3FolderHistory: IS3Folder[] = await getS3FolderHistoryByName(
				group.id,
				parseInt(assetId, 10),
				folderName
			);

			if (!s3FolderHistory || s3FolderHistory.length === 0) {
				throw new HttpException(req, res, 404, `No S3 folder history found for asset ${assetId}`);
			}

			res.status(200).json(s3FolderHistory);
		} catch (error) {
			next(error);
		}
	};

	private getAssetS3StorageToken = (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): void => {
		try {
			const { assetId, folderName, initDate, finalDate } = req.params;
			const groupId = req.group.id;
			const userId = req.user.id;
			const token = generateS3StorageToken(
				userId,
				groupId,
				parseInt(assetId, 10),
				folderName,
				initDate,
				finalDate
			);
			res.status(200).json(token);
		} catch (error) {
			next(error);
		}
	};

	private getAssetDataFromS3 = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { assetId, folderName, initDate, finalDate, token } = req.params;

			const isValidToken = isS3StorageTokenValid(req.group, assetId, folderName, initDate, finalDate, token);
			if (!isValidToken) {
				throw new HttpException(req, res, 401, "You are not allowed to get s3 storage token.");
			}

			const asset = await getAssetByPropName("id", assetId);
			if (!asset) throw new ItemNotFoundException(req, res, "The asset", "id", assetId);

			const group = req.group;
			const s3FolderHistory: IS3Folder[] = await getS3FolderHistoryByName(
				group.id,
				parseInt(assetId, 10),
				folderName
			);

			if (!s3FolderHistory || s3FolderHistory.length === 0) {
				throw new HttpException(req, res, 404, `No S3 folder history found for asset ${assetId}`);
			}

			// Pass date range to filter files by day partitions
			const files = await getBucketFolderFileNames(folderName, initDate, finalDate, s3FolderHistory);

			if (files.length === 0) {
				throw new HttpException(
					req,
					res,
					404,
					`No files found in bucket for the given date range ${initDate} to ${finalDate}`
				);
			}

			const zipFileName = `${folderName}_${initDate}_${finalDate}`;
			const archive = generateZipFileStream(files);

			res.setHeader("Content-Type", "application/zip");
			res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}.zip"`);

			archive.on("error", (err) => next(err));
			archive.pipe(res);
		} catch (error) {
			next(error);
		}
	};

	private deleteS3FoldersByName = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { assetId, folderName } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			const groupId = req.params.groupId;
			const groupIdNum = parseInt(groupId, 10);
			const s3Folders = await getS3FolderHistoryByName(groupIdNum, assetIdNum, folderName);
			if (!s3Folders || s3Folders.length === 0)
				throw new ItemNotFoundException(req, res, "The S3 folder", "folderName", folderName);
			await deleteFoldersInS3Bucket(s3Folders);
			await deleteS3FoldersByName(groupIdNum, assetIdNum, folderName);
			const message = { message: "S3 folder deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateS3FolderParquetSchemaById = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const s3FolderData = req.body;
			const { assetId, folderName } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			const s3Folder = await getS3FolderByProp(assetIdNum, "folderName", folderName);
			if (!s3Folder) throw new ItemNotFoundException(req, res, "The S3 folder", "folderName", folderName);
			await updateS3FolderParquetSchemaById(s3Folder.id, s3FolderData);
			const message = { message: "S3 folder updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateS3FolderParquetStatsById = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const s3FolderData = req.body;
			const { assetId, folderName } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			const s3Folder = await getS3FolderByProp(assetIdNum, "folderName", folderName);
			if (!s3Folder) throw new ItemNotFoundException(req, res, "The S3 folder", "folderName", folderName);
			await updateS3FolderParquetStatsById(s3Folder.id, s3FolderData);
			const message = { message: "S3 folder stats updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createS3Folder = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const s3FolderData: CreateS3FolderDto = req.body;
			const groupId = req.group.id;
			const { assetId } = req.params;
			const assetIdNum = parseInt(assetId, 10);
			if (isNaN(assetIdNum)) throw new InvalidPropNameExeception(req, res, "assetId");
			const s3Folder = await getS3FolderByProp(assetIdNum, "folderName", s3FolderData.folderName);
			if (s3Folder)
				throw new ItemNotFoundException(
					req,
					res,
					"The S3 folder with this name already exists",
					"folderName",
					s3FolderData.folderName
				);
			await insertS3Folder(groupId, assetIdNum, s3FolderData);
			const message = { message: `A new S3 folder has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidS3FolderPropName = (propName: string) => {
		const validPropName = ["id", "folderName"];
		return validPropName.indexOf(propName) !== -1;
	};
}

export default S3FolderController;
