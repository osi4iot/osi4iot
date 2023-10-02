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
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import {
	addDashboardUrls,
	createDigitalTwin,
	deleteDigitalTwinById,
	getAllDigitalTwins,
	getDigitalTwinByProp,
	getDigitalTwinsByGroupId,
	getDigitalTwinsByGroupsIdArray,
	getDigitalTwinsByOrgId,
	getStateOfAllDigitalTwins,
	getStateOfDigitalTwinsByGroupsIdArray,
	updateDigitalTwinById,
	getAllDigitalTwinSimulators,
	getDigitalTwinSimulatorsByGroupsIdArray,
	addMqttTopicsToDigitalTwinSimulators,
	getDigitalTwinMqttTopicsInfoFromByDTIdsArray,
	generateDigitalTwinMqttTopics,
	verifyAndCorrectDigitalTwinReferences,
	getDigitalTwinGltfData,
	getBucketFolderInfoFileList,
	deleteBucketFile,
	removeFilesFromBucketFolder,
	checkMaxNumberOfFemResFiles,
	checkNumberOfGltfFiles,
} from "./digitalTwinDAL";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import HttpException from "../../exceptions/HttpException";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import s3Client from "../../config/s3Config";
import process_env from "../../config/api_config";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import UpdateDigitalTwinDto from "./digitalTwinUpdate.dto";
import { assetAndGroupExist } from "../../middleware/assetAndGroupExist.middleware";
import digitalTwinAndGroupExist from "../../middleware/digitalTwinAndGroupExist.middleware";
import IRequestWithAssetAndGroup from "../group/interfaces/requestWithAssetAndGroup.interface";
import IRequestWithDigitalTwinAndGroup from "../group/interfaces/requestWithDigitalTwinAndGroup.interface";

const uploadDigitalTwinFile = multer({
	storage: multerS3({
		s3: s3Client,
		bucket: process_env.S3_BUCKET_NAME,
		metadata: (req, file, cb) => {
			cb(null, { fieldName: file.fieldname });
		},
		key: (req: IRequestWithDigitalTwinAndGroup, file, cb) => {
			const group = req.group;
			const { groupId, digitalTwinId, folder, fileName } = req.params;
			const keyBase = `org_${group.orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
			const fileKey = `${keyBase}/${folder}/${fileName}`;
			cb(null, fileKey)
		}
	})
})

class DigitalTwinController implements IController {
	public path = "/digital_twin";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getDigitalTwinsManagedByUser
			)
			.get(
				`${this.path}s_state/user_managed/`,
				userAuth,
				this.getStateOfDigitalTwinsManagedByUser
			)
			.get(
				`${this.path}_simulators/user_managed/`,
				userAuth,
				this.getDigitalTwinSimulatorsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getDigitalTwinsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getDigitalTwinsInGroup
			)
			.get(
				`${this.path}_mqtt_topics_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getDigitalTwinMqttTopicsInGroup
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getDigitalTwinByProp
			)
			.get(
				`${this.path}_gltfdata/:groupId/:digitalTwinId`,
				groupExists,
				groupAdminAuth,
				this.getDigitalTwinGltfData
			)
			.delete(
				`${this.path}/:groupId/:digitalTwinId`,
				groupExists,
				groupAdminAuth,
				this.deleteDigitalTwinById
			)
			.patch(
				`${this.path}/:groupId/:digitalTwinId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateDigitalTwinDto>(UpdateDigitalTwinDto),
				this.updateDigitalTwinById
			)
			.post(
				`${this.path}/:groupId/:assetId`,
				assetAndGroupExist,
				groupAdminAuth,
				validationMiddleware<CreateDigitalTwinDto>(CreateDigitalTwinDto, true),
				this.createDigitalTwin
			)
			.post(
				`${this.path}_upload_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupAdminAuth,
				uploadDigitalTwinFile.single('file'),
				this.uploadDigitalTwinFile
			)
			.get(
				`${this.path}_download_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupAdminAuth,
				this.downloadDigitalTwinFile
			)
			.get(
				`${this.path}_file_list/:groupId/:digitalTwinId/:folder`,
				digitalTwinAndGroupExist,
				groupAdminAuth,
				this.getDigitalTwinFileInfoList
			)
			.delete(
				`${this.path}_delete_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupAdminAuth,
				this.deleteDigitalTwinFile
			)
	}

	private getDigitalTwinsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let digitalTwins: IDigitalTwin[] = [];
			if (req.user.isGrafanaAdmin) {
				digitalTwins = await getAllDigitalTwins();
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
					digitalTwins = await getDigitalTwinsByGroupsIdArray(groupsIdArray);
				}
			}
			const digitalTwinsExtended = await addDashboardUrls(digitalTwins);
			res.status(200).send(digitalTwinsExtended);
		} catch (error) {
			next(error);
		}
	};

	private getStateOfDigitalTwinsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let digitalTwinsState: IDigitalTwinState[] = [];
			if (req.user.isGrafanaAdmin) {
				digitalTwinsState = await getStateOfAllDigitalTwins();
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
					digitalTwinsState = await getStateOfDigitalTwinsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(digitalTwinsState);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinSimulatorsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let digitalTwinSimulators: IDigitalTwinSimulator[] = [];
			if (req.user.isGrafanaAdmin) {
				digitalTwinSimulators = await getAllDigitalTwinSimulators();
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
					digitalTwinSimulators = await getDigitalTwinSimulatorsByGroupsIdArray(groupsIdArray);
				}
			}
			const digitalTwinSimulatorsExtended = await addMqttTopicsToDigitalTwinSimulators(digitalTwinSimulators);
			res.status(200).send(digitalTwinSimulatorsExtended);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwins = await getDigitalTwinsByOrgId(req.organization.id);
			res.status(200).send(digitalTwins);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwins = await getDigitalTwinsByGroupId(req.group.id);
			res.status(200).send(digitalTwins);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinMqttTopicsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinsInGroup = await getDigitalTwinsByGroupId(req.group.id);
			const digitalTwinIdsArray = digitalTwinsInGroup.map(digitalTwin => digitalTwin.id);
			const digitalTwinMqttTopicsInfo = await getDigitalTwinMqttTopicsInfoFromByDTIdsArray(digitalTwinIdsArray);
			const digitalTwinMqttTopics = generateDigitalTwinMqttTopics(digitalTwinMqttTopicsInfo);
			res.status(200).send(digitalTwinMqttTopics);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidTopicPropName(propName)) throw new InvalidPropNameExeception(propName);
			const digitalTwin = await getDigitalTwinByProp(propName, propValue);
			if (!digitalTwin) throw new ItemNotFoundException("The digital twin", propName, propValue);
			res.status(200).json(digitalTwin);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinGltfData = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", parseInt(digitalTwinId, 10));
			if (!digitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			const digitalTwinGltfData = await getDigitalTwinGltfData(digitalTwin);
			res.status(200).send(digitalTwinGltfData);
		} catch (error) {
			next(error);
		}
	};

	private deleteDigitalTwinById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!digitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			await deleteDigitalTwinById(digitalTwin);
			const orgId = digitalTwin.orgId;
			const groupId = digitalTwin.groupId;
			const bucketFolder = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
			await removeFilesFromBucketFolder(bucketFolder);
			const message = { message: "Digital twin deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateDigitalTwinById = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData = req.body;
			const group = req.group;
			const { digitalTwinId } = req.params;
			const existentDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!existentDigitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			const digitalTwinUpdated: IDigitalTwin& UpdateDigitalTwinDto = { ...existentDigitalTwin, ...digitalTwinData };
			if (digitalTwinData.isGltfFileModified) {
				await verifyAndCorrectDigitalTwinReferences(group, digitalTwinUpdated);
			}
			await updateDigitalTwinById(parseInt(digitalTwinId, 10), digitalTwinUpdated);
			const message = { message: "Digital twin updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createDigitalTwin = async (
		req: IRequestWithAssetAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData: CreateDigitalTwinDto = req.body;
			const asset = req.asset;
			const group = req.group;

			let response: { message: string, digitalTwinId: number, topicSensors: { id: number; topicName: string }[] };
			const existDigitalTwin = await getDigitalTwinByProp("digital_twin_uid", digitalTwinData.digitalTwinUid)
			if (!existDigitalTwin) {
				const { digitalTwin, topicSensors } = await createDigitalTwin(group, asset, digitalTwinData);
				if (digitalTwin) {
					response = {
						message: `A new digital twin has been created`,
						digitalTwinId: digitalTwin.id,
						topicSensors: topicSensors.map(topicSensor => { return { id: topicSensor.id, topicName: topicSensor.topicName } })
					};
				} else {
					throw new HttpException(400, "The entered value of dashboardUid is not correct");
				}
			} else {
				throw new HttpException(400, `A digital twin with uid: ${digitalTwinData.digitalTwinUid} already exist`);
			}
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private uploadDigitalTwinFile = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const { fileName, folder } = req.params;
		try {
			const message = {
				message: `The file ${fileName} has been successfully uploaded in the S3 bucket`,
			};
			if (folder === "femResFile") {
				await checkMaxNumberOfFemResFiles(req.digitalTwin);
			} else if (folder === "gltfFile") {
				await checkNumberOfGltfFiles(req.digitalTwin);
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private downloadDigitalTwinFile = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, digitalTwinId, folder, fileName } = req.params;
		const keyBase = `org_${group.orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
		const fileKey = `${keyBase}/${folder}/${fileName}`;

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

	private getDigitalTwinFileInfoList = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, digitalTwinId, folder } = req.params;
		const keyBase = `org_${group.orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
		const folderPath = `${keyBase}/${folder}`

		try {
			const fileInfoList = await getBucketFolderInfoFileList(folderPath)
			res.status(200).send(fileInfoList);
		} catch (error) {
			next(error);
		}
	};


	private deleteDigitalTwinFile = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const group = req.group;
		const { groupId, digitalTwinId, folder, fileName } = req.params;
		const keyBase = `org_${group.orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
		const fileKey = `${keyBase}/${folder}/${fileName}`;
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

	private isValidTopicPropName = (propName: string) => {
		const validPropName = ["id", "digital_twin_uid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default DigitalTwinController;

