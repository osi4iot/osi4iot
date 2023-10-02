import { Router, NextFunction, Request, Response } from "express";
import multer from 'multer';
import multerS3 from 'multer-s3';
import { ReadStream } from 'fs';
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminAuth, organizationAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateMLModelDto from "./ml_model.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import {
	createMLModel,
	deleteMLModelByProp,
	getAllMLModels,
	getMLModelByProp,
	getMLModelsByGroupId,
	getMLModelsByGroupsIdArray,
	getMLModelsByOrgId,
	updateMLModelByProp
} from "./ml_modelDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IMLModel from "./ml_model.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import { deleteBucketFile, getBucketFolderInfoFileList, removeFilesFromBucketFolder } from "../digitalTwin/digitalTwinDAL";
import s3Client from "../../config/s3Config";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import process_env from "../../config/api_config";
import IRequestWithMLModelAndGroup from "./requestWithMLModelAndGroup.interface";
import mlModelAndGroupExist from "../../middleware/mlModelAndGroupExist.middleware";
import UpdateMLModelDto from "./ml_modelUpdate.dto";

const uploadMLModelFile = multer({
	storage: multerS3({
		s3: s3Client,
		bucket: process_env.S3_BUCKET_NAME,
		metadata: (req, file, cb) => {
			cb(null, { fieldName: file.fieldname });
		},
		key: (req: IRequestWithMLModelAndGroup, file, cb) => {
			const group = req.group;
			const { groupId, mlModelId, fileName } = req.params;
			const keyBase = `org_${group.orgId}/group_${groupId}/ml_models/ml_model_${mlModelId}`;
			const fileKey = `${keyBase}/${fileName}`;
			cb(null, fileKey)
		}
	})
})

class MLModelController implements IController {
	public path = "/ml_model";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getMLModelsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getMLModelsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getMLModelsInGroup
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getMLModelByProp
			)
			.delete(
				`${this.path}/:groupId/:mlModelId`,
				groupExists,
				groupAdminAuth,
				this.deleteMLModelById
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateMLModelDto>(UpdateMLModelDto, true),
				this.updateMLModelByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateMLModelDto>(CreateMLModelDto),
				this.createMLModel
			)
			.post(
				`${this.path}_upload_file/:groupId/:mlModelId/:fileName`,
				mlModelAndGroupExist,
				groupAdminAuth,
				uploadMLModelFile.single('file'),
				this.uploadMLModelFile
			)
			.get(
				`${this.path}_download_file/:groupId/:mlModelId/:fileName`,
				mlModelAndGroupExist,
				groupAdminAuth,
				this.downloadMLModelFile
			)
			.get(
				`${this.path}_file_list/:groupId/:mlModelId`,
				mlModelAndGroupExist,
				groupAdminAuth,
				this.getMLModelFilesInfoList
			)
			.delete(
				`${this.path}_delete_file/:groupId/:mlModelId/:fileName`,
				mlModelAndGroupExist,
				groupAdminAuth,
				this.deleteMLModelFile
			)
	}

	private getMLModelsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let mlModels: IMLModel[] = [];
			if (req.user.isGrafanaAdmin) {
				mlModels = await getAllMLModels();
			} else {
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map(org => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray)
					const groupsIdArray = groups.map(group => group.id);
					groupsInOrgs.forEach(groupInOrg => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					})
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map(group => group.id);
					mlModels = await getMLModelsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(mlModels);
		} catch (error) {
			next(error);
		}
	};

	private getMLModelsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const mlModels = await getMLModelsByOrgId(req.organization.id);
			res.status(200).send(mlModels);
		} catch (error) {
			next(error);
		}
	};

	private getMLModelsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const mlModels = await getMLModelsByGroupId(req.group.id);
			res.status(200).send(mlModels);
		} catch (error) {
			next(error);
		}
	};

	private getMLModelByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidMLModelPropName(propName)) throw new InvalidPropNameExeception(propName);
			const mlModel = await getMLModelByProp(propName, propValue);
			if (!mlModel) throw new ItemNotFoundException("The ML model", propName, propValue);
			res.status(200).json(mlModel);
		} catch (error) {
			next(error);
		}
	};

	private deleteMLModelById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { mlModelId } = req.params;
			const mlModel = await getMLModelByProp("id", mlModelId);
			if (!mlModel) throw new ItemNotFoundException("The ML model", "id", mlModelId);
			await deleteMLModelByProp("id", mlModelId);
			const bucketFolder = `org_${mlModel.orgId}/group_${mlModel.groupId}/ml_models/ml_model_${mlModel.id}`;
			await removeFilesFromBucketFolder(bucketFolder);
			const message = { message: "ML model deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateMLModelByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const mlModelData = req.body;
			if (!this.isValidMLModelPropName(propName)) throw new InvalidPropNameExeception(propName);
			let mlModel = await getMLModelByProp(propName, propValue);
			if (!mlModel) throw new ItemNotFoundException("The ML model", propName, propValue);
			mlModel = { ...mlModel, description: mlModelData.description };
			await updateMLModelByProp(propName, propValue, mlModel);
			if (mlModelData.areMlModelFilesModified) {
				const bucketFolder = `org_${mlModel.orgId}/group_${mlModel.groupId}/ml_models/ml_model_${mlModel.id}`;
				await removeFilesFromBucketFolder(bucketFolder);
			}
			const message = { message: "ML model updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createMLModel = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const mlModelData: CreateMLModelDto = req.body;
			const newMlModel = await createMLModel(req.group, mlModelData);
			const message = {
				message: `A new ML model has been created`,
				mlModelId: newMlModel.id
			};
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private uploadMLModelFile = (
		req: IRequestWithMLModelAndGroup,
		res: Response,
		next: NextFunction
	): void => {
		const { fileName } = req.params;
		try {
			const message = {
				message: `The file ${fileName} has been successfully uploaded in the S3 bucket`,
			};
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private downloadMLModelFile = async (
		req: IRequestWithMLModelAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, mlModelId, fileName } = req.params;
		const keyBase = `org_${group.orgId}/group_${groupId}/ml_models/ml_model_${mlModelId}`;
		const fileKey = `${keyBase}/${fileName}`;

		const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: fileKey,
		};

		try {
			const data = await s3Client.send(new GetObjectCommand(bucketParams));
			const stream = data.Body as unknown as ReadStream;
			stream.pipe(res);
		} catch (error) {
			next(error);
		}
	};

	private getMLModelFilesInfoList = async (
		req: IRequestWithMLModelAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, mlModelId } = req.params;
		const folderPath = `org_${group.orgId}/group_${groupId}/ml_models/ml_model_${mlModelId}`

		try {
			const fileInfoList = await getBucketFolderInfoFileList(folderPath);
			res.status(200).send(fileInfoList);
		} catch (error) {
			next(error);
		}
	};

	private deleteMLModelFile = async (
		req: IRequestWithMLModelAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, mlModelId, fileName } = req.params;
		const keyBase = `org_${group.orgId}/group_${groupId}/ml_models/ml_model_${mlModelId}`;
		const fileKey = `${keyBase}/${fileName}`;
		try {
			await deleteBucketFile(fileKey);
			const message = {
				message: `The file ${fileName} has been successfully deleted from the S3 bucket`,
			};
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidMLModelPropName = (propName: string) => {
		const validPropName = ["id", "ml_model_uid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default MLModelController;