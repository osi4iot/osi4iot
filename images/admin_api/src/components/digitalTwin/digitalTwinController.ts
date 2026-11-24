import { Router, NextFunction, Request, Response } from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { ReadStream } from "fs";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { organizationAdminAuth, userAuth, groupViewerAuth, groupEditorAuth } from "../../middleware/auth.middleware";
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
	getBucketFolderInfoFileList,
	deleteBucketFile,
	removeFilesFromBucketFolder,
	checkMaxNumberOfFemResFiles,
	checkNumberOfGltfFiles,
	checkDigitalTwinConstraint,
	checkExistentSensorsRef,
	addDashboardUrls,
	getDigitalTwinGlbFile,
	getDigitalTwinData,
	getDigitalTwinGltfFile,
	getAllDTTopics,
	getDTTopicsByGroupsIdArray,
	getDTTopicsByDigitalTwinId,
	updateDigitalTwinViewerSettings,
} from "./digitalTwinDAL";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import HttpException from "../../exceptions/HttpException";
import { IRequestWithGroupRole } from "../../middleware/auth.middleware";
import { checkDeletion, expensiveResourcesOfDigitalTwin, topicsOfDigitalTwin } from "../../utils/permissions/deletePolicy";
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
import infoLogger from "../../utils/logger/infoLogger";
import { getAssetByPropName, getAssetTopicsInfoFromByDTIdsArray } from "../asset/assetDAL";
import type { Readable } from "stream";
import {
	applyPipelineAction,
	createDigitalTwinPipeline,
	deleteDigitalTwinPipeline,
	updateDigitalTwinPipeline,
} from "./pipeline";
import CreatePipelineActionDto from "./pipeline_action.dto";
import UpdateViewerSettingsDto from "./viewerSettings.dto";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import PipelineDto from "./pipeline.dto";
import natsClient from "../../config/natsConfig";
import {
	MAX_FEM_RESULT_FILES,
	MODEL_FILE_NAME,
	missingSensorsRef,
	registerModel,
	removeModel,
	setMaxFemResultFiles,
	setSimulatorFormat,
	simulatorFormatProblem,
} from "./digitalTwinParts";
import { copySlideFiles, getSlideModels, modelKeyBase, scopeOfQuery, slideOfQuery, slideOfScope, slidesInOrder, twinKeyBase } from "./slideModels";
import { CANVAS_MAX_BYTES, canvasSceneProblem, getSlideCanvas, putSlideCanvas } from "./slideCanvas";
import { getViewerLayout } from "../viewerLayout/viewerLayoutDAL";

// a list of at most 500 strings, or null
const stringListOf = (value: unknown): string[] | null =>
	Array.isArray(value) && value.length <= 500 && value.every((v) => typeof v === "string" && v.length <= 190) ? (value as string[]) : null;

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
			const twin = { orgId: group.orgId, groupId: Number(groupId), id: Number(digitalTwinId) };
			// a model and its FEM results go to their slide (validDigitalTwinUploadFolder checked it)
			const keyBase = folderKeyBase(twin, folder, scopeOfQuery(req.query.slide) ?? "");
			cb(null, `${keyBase}/${folder}/${fileName}`);
		},
	}),
});

// The folders a digital twin's files can be uploaded to. The documents
// the AI agents read are no longer per digital twin (docInfoFiles): they
// are the group's knowledge base (group_knowledge_upload_file).
// viewerImages: the pictures of the Picture panels of the Viewer page (JPEG, PNG, WebP, GIF and SVG).
const DIGITAL_TWIN_UPLOAD_FOLDERS = ["gltfFile", "femResJson", "viewerImages"];

export const VIEWER_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}\.(png|jpe?g|webp|gif|svg)$/i;
export const VIEWER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIEWER_IMAGES_MAX_FILES = 100;
export const viewerImageContentType = (fileName: string): string => {
	const ext = fileName.split(".").pop()?.toLowerCase();
	if (ext === "svg") return "image/svg+xml";
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	return `image/${ext}`;
};

// the folders of a slide's 3D model (slideModels.ts); the others are the twin's
const SLIDE_FOLDERS = ["gltfFile", "femResJson"];
const folderKeyBase = (twin: { orgId: number; groupId: number; id?: number }, folder: string, slideId: string): string =>
	SLIDE_FOLDERS.includes(folder) ? modelKeyBase(twin, slideId) : twinKeyBase(twin);

const validDigitalTwinUploadFolder = (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): void => {
	const { folder } = req.params;
	const slideId = scopeOfQuery(req.query.slide);
	if (SLIDE_FOLDERS.includes(folder) && !slideId) {
		return next(new HttpException(req, res, 400, "A 3D model and its FEM results go to a slide: ?slide=<slide id>"));
	}
	if (!DIGITAL_TWIN_UPLOAD_FOLDERS.includes(folder)) {
		const hint = folder === "docInfoFiles" ? " Documents for the AI agents go to the group's knowledge base." : "";
		return next(new HttpException(req, res, 400, `Invalid digital twin folder: ${folder}.${hint}`));
	}
	if (folder === "gltfFile" && !MODEL_FILE_NAME.test(req.params.fileName)) {
		return next(new HttpException(req, res, 400, "A 3D model must be a .glb or .gltf file (at most 200 characters)."));
	}
	if (folder === "femResJson" && !/^[^/\\]{1,200}\.json$/i.test(req.params.fileName)) {
		return next(new HttpException(req, res, 400, "FEM results must be a .json file (at most 200 characters)."));
	}
	if (folder === "viewerImages" && !VIEWER_IMAGE_NAME.test(req.params.fileName)) {
		return next(
			new HttpException(req, res, 400, "The name of a viewer image must end in .png, .jpg, .jpeg, .webp, .gif or .svg (letters, digits, _ . -; at most 80 characters).")
		);
	}
	next();
};

class DigitalTwinController implements IController {
	public path = "/digital_twin";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(`${this.path}s/user_managed/`, userAuth, this.getDigitalTwinsManagedByUser)
			.get(`${this.path}s_state/user_managed/`, userAuth, this.getStateOfDigitalTwinsManagedByUser)
			.get(`${this.path}_simulators/user_managed/`, userAuth, this.getDigitalTwinSimulatorsManagedByUser)
			.get(`${this.path}s_in_org/:orgId/`, organizationAdminAuth, organizationExists, this.getDigitalTwinsInOrg)
			.get(`${this.path}s_in_group/:groupId`, groupExists, groupViewerAuth, this.getDigitalTwinsInGroup)
			.get(
				`${this.path}_mqtt_topics_in_group/:groupId`,
				groupExists,
				groupViewerAuth,
				this.getDigitalTwinMqttTopicsInGroup
			)
			.get(`${this.path}/:groupId/:propName/:propValue`, groupExists, groupViewerAuth, this.getDigitalTwinByProp)
			.get(`${this.path}_data/:groupId/:digitalTwinId`, groupExists, groupViewerAuth, this.getDigitalTwinData)
			.get(
				`${this.path}_glbfile/:groupId/:digitalTwinId`,
				groupExists,
				groupViewerAuth,
				this.getDigitalTwinGlbFile
			)
			.get(
				`${this.path}_gltffile/:groupId/:digitalTwinId`,
				groupExists,
				groupViewerAuth,
				this.getDigitalTwinGltfFile
			)
			.delete(`${this.path}/:groupId/:digitalTwinId`, groupExists, groupEditorAuth, this.deleteDigitalTwinById)
			.patch(
				`${this.path}/:groupId/:digitalTwinId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<UpdateDigitalTwinDto>(UpdateDigitalTwinDto),
				this.updateDigitalTwinById
			)
			.post(
				`${this.path}/:groupId/:assetId`,
				assetAndGroupExist,
				groupEditorAuth,
				validationMiddleware<CreateDigitalTwinDto>(CreateDigitalTwinDto, true),
				this.createDigitalTwin
			)
			.post(
				`${this.path}_upload_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validDigitalTwinUploadFolder,
				uploadDigitalTwinFile.single("file"),
				this.uploadDigitalTwinFile
			)
			.get(
				`${this.path}_download_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupViewerAuth,
				this.downloadDigitalTwinFile
			)
			.get(
				`${this.path}_file_list/:groupId/:digitalTwinId/:folder`,
				digitalTwinAndGroupExist,
				groupViewerAuth,
				this.getDigitalTwinFileInfoList
			)
			.delete(
				`${this.path}_delete_file/:groupId/:digitalTwinId/:folder/:fileName`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				this.deleteDigitalTwinFile
			)
			.post(
				`${this.path}_pipeline/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validationMiddleware<PipelineDto>(PipelineDto, true),
				this.createPipeline
			)
			.patch(
				`${this.path}_pipeline/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validationMiddleware<PipelineDto>(PipelineDto, true),
				this.updatePipeline
			)
			.delete(
				`${this.path}_pipeline/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validationMiddleware<PipelineDto>(PipelineDto, true),
				this.deletePipeline
			)
			.put(
				`${this.path}_viewer_settings/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validationMiddleware<UpdateViewerSettingsDto>(UpdateViewerSettingsDto),
				this.updateViewerSettings
			)
			.post(
				`${this.path}_pipeline_action/:groupId/:digitalTwinId`,
				digitalTwinAndGroupExist,
				groupEditorAuth,
				validationMiddleware<CreatePipelineActionDto>(CreatePipelineActionDto, true),
				this.setPipelineAction
			)
			// the parts of the twin the Viewer loads (digitalTwinParts.ts; README, "Viewer data")
			.post(`${this.path}_model_check/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.checkModel)
			.put(`${this.path}_model/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.registerModel)
			.delete(`${this.path}_model/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.removeModel)
			.put(`${this.path}_simulator_format/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.setSimulatorFormat)
			.put(`${this.path}_fem_settings/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.setFemSettings)
			// the 3D models of the slides (slideModels.ts): those there are, in the order of the layout; a copy for a
			// duplicated slide
			.get(`${this.path}_slide_models/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupViewerAuth, this.getSlideModels)
			.post(`${this.path}_slide_copy/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.copySlide)
			// the Canvas of a slide (slideCanvas.ts): its scene, ?slide=<slide id>
			.get(`${this.path}_slide_canvas/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupViewerAuth, this.getSlideCanvas)
			.put(`${this.path}_slide_canvas/:groupId/:digitalTwinId`, digitalTwinAndGroupExist, groupEditorAuth, this.putSlideCanvas)
			.get(`${this.path}_topics/user_managed`, userAuth, this.getDigitalTwinTopicsUserManaged)
			.get(
				`${this.path}_topics/:groupId/:digitalTwinId`,
				groupExists,
				groupViewerAuth,
				this.getDigitalTwinTopicsByDTid
			);
	}

	// the sensor references of a model, before uploading it: those its asset does not have
	private checkModel = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const refs = stringListOf(req.body?.sensorsRef);
			if (!refs) throw new HttpException(req, res, 400, "sensorsRef must be a list of strings");
			res.status(200).json({ missingSensorsRef: await missingSensorsRef(req.digitalTwin.assetId, refs) });
		} catch (error) {
			next(error);
		}
	};

	// the model just uploaded (digital_twin_upload_file, folder gltfFile)
	private registerModel = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const body = (req.body ?? {}) as { fileName?: unknown; sensorsRef?: unknown };
			const fileName: string = typeof body.fileName === "string" ? body.fileName : "";
			const refs = stringListOf(body.sensorsRef);
			if (!MODEL_FILE_NAME.test(fileName)) throw new HttpException(req, res, 400, "fileName must be a .glb or .gltf file");
			if (!refs) throw new HttpException(req, res, 400, "sensorsRef must be a list of strings");
			const slideId = scopeOfQuery(req.query.slide);
			if (!slideId) throw new HttpException(req, res, 400, "The slide of the model is missing: ?slide=<slide id>");
			const missing = await missingSensorsRef(req.digitalTwin.assetId, refs);
			if (missing.length) {
				throw new HttpException(req, res, 400, `The asset has no sensor with the reference: ${missing.join(", ")}`);
			}
			let result: { type: string; fileName: string };
			try {
				result = await registerModel(req.group, req.digitalTwin, slideId, fileName, refs);
			} catch (error) {
				throw new HttpException(req, res, 400, error instanceof Error ? error.message : String(error));
			}
			res.status(200).json({ message: `The 3D model ${fileName} has been loaded`, ...result });
		} catch (error) {
			next(error);
		}
	};

	private removeModel = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const slideId = scopeOfQuery(req.query.slide);
			if (!slideId) throw new HttpException(req, res, 400, "The slide of the model is missing: ?slide=<slide id>");
			await removeModel(req.digitalTwin, slideId);
			res.status(200).json({ message: "The 3D model has been removed" });
		} catch (error) {
			next(error);
		}
	};

	private setSimulatorFormat = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const format = req.body?.format;
			const problem = simulatorFormatProblem(format);
			if (problem) throw new HttpException(req, res, 400, problem);
			const fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "-";
			const lastModifDate = typeof req.body?.lastModifDate === "string" ? req.body.lastModifDate : "-";
			await setSimulatorFormat(req.digitalTwin, format as Record<string, unknown>, fileName, lastModifDate);
			res.status(200).json({ message: "The simulator format has been saved" });
		} catch (error) {
			next(error);
		}
	};

	private getSlideModels = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const models = await getSlideModels(req.digitalTwin);
			const layout = (await getViewerLayout(Number(req.group.id), Number(req.digitalTwin.id)))?.layout ?? null;
			res.status(200).json(
				slidesInOrder(layout, Object.keys(models)).map((slideId) => ({ slideId, ...models[slideId] }))
			);
		} catch (error) {
			next(error);
		}
	};

	// the files of a slide's model, for the slide that duplicates it (body { from, to }); while the copy is not saved
	// in the group's layout, the next save removes them (removedModelSlides)
	private copySlide = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const from = slideOfQuery(req.body?.from);
			const to = slideOfQuery(req.body?.to);
			if (!from || !to || from === to) throw new HttpException(req, res, 400, "from and to must be two slide ids");
			const models = await getSlideModels(req.digitalTwin);
			if (Object.keys(models).some((scope) => slideOfScope(scope) === to)) {
				throw new HttpException(req, res, 400, `The slide ${to} already has files`);
			}
			// its model and those of the frames of its canvas
			const { copied, scopes } = await copySlideFiles(req.digitalTwin, from, to);
			for (const scope of scopes) {
				if (!models[`${from}${scope.slice(to.length)}`]?.femResults) continue;
				await natsClient.jsPublish("femResults", "create", req.digitalTwin.id, {
					groupId: req.digitalTwin.groupId,
					digitalTwinId: req.digitalTwin.id,
					slideId: scope,
				});
			}
			res.status(200).json({ message: `${copied} files copied`, copied });
		} catch (error) {
			next(error);
		}
	};

	private getSlideCanvas = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const slideId = slideOfQuery(req.query.slide);
			if (!slideId) throw new HttpException(req, res, 400, "The slide of the canvas is missing: ?slide=<slide id>");
			const scene = await getSlideCanvas(req.digitalTwin, slideId);
			if (scene === null) throw new HttpException(req, res, 404, "The slide has no canvas");
			res.status(200).type("application/json").send(scene);
		} catch (error) {
			next(error);
		}
	};

	// body { scene }: the scene of Excalidraw (its elements, files and appState)
	private putSlideCanvas = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const slideId = slideOfQuery(req.query.slide);
			if (!slideId) throw new HttpException(req, res, 400, "The slide of the canvas is missing: ?slide=<slide id>");
			const scene = req.body?.scene;
			const problem = canvasSceneProblem(scene);
			if (problem) throw new HttpException(req, res, 400, problem);
			const json = JSON.stringify(scene);
			if (Buffer.byteLength(json) > CANVAS_MAX_BYTES) {
				throw new HttpException(req, res, 413, `The canvas has more than ${CANVAS_MAX_BYTES / 1024 / 1024} MB (its pictures)`);
			}
			await putSlideCanvas(req.digitalTwin, slideId, json);
			res.status(200).json({ message: "The canvas has been saved" });
		} catch (error) {
			next(error);
		}
	};

	private setFemSettings = async (req: IRequestWithDigitalTwinAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const max = Number(req.body?.maxNumResFemFiles);
			if (!Number.isInteger(max) || max < 1 || max > MAX_FEM_RESULT_FILES) {
				throw new HttpException(req, res, 400, `maxNumResFemFiles must be a whole number from 1 to ${MAX_FEM_RESULT_FILES}`);
			}
			await setMaxFemResultFiles(req.digitalTwin, max);
			res.status(200).json({ message: `The digital twin keeps its ${max} newest FEM result files` });
		} catch (error) {
			next(error);
		}
	};

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
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
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
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
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
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
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
			const digitalTwinIdsArray = digitalTwinsInGroup.map((digitalTwin) => digitalTwin.id);
			const digitalTwinTopicsInfo = await getDigitalTwinMqttTopicsInfoFromByDTIdsArray(digitalTwinIdsArray);
			const assetTopicsInfo = await getAssetTopicsInfoFromByDTIdsArray(digitalTwinIdsArray);
			const digitalTwinMqttTopicsInfo = [...digitalTwinTopicsInfo, ...assetTopicsInfo];
			const digitalTwinMqttTopics = generateDigitalTwinMqttTopics(digitalTwinMqttTopicsInfo);
			res.status(200).send(digitalTwinMqttTopics);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinByProp = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidTopicPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const digitalTwin = await getDigitalTwinByProp(propName, propValue);
			if (!digitalTwin) throw new ItemNotFoundException(req, res, "The digital twin", propName, propValue);
			res.status(200).json(digitalTwin);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinData = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", parseInt(digitalTwinId, 10));
			if (!digitalTwin) throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			const digitalTwinData = await getDigitalTwinData(req.group, digitalTwin);
			// the viewer opens a control room or the organization overview with their panels (any member reads it)
			const asset = await getAssetByPropName("id", digitalTwin.assetId);
			digitalTwinData.assetContext = asset?.context ?? "asset";
			res.status(200).send(digitalTwinData);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinGltfFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", parseInt(digitalTwinId, 10));
			if (!digitalTwin) throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			const digitalTwinGltfFile = await getDigitalTwinGltfFile(digitalTwin, scopeOfQuery(req.query.slide) ?? "");
			res.status(200).send(digitalTwinGltfFile);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinGlbFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", parseInt(digitalTwinId, 10));
			if (!digitalTwin) throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			const response = await getDigitalTwinGlbFile(digitalTwin, scopeOfQuery(req.query.slide) ?? "");
			if (!response) throw new HttpException(req, res, 500, "The glb file does not exist");
			res.set("content-type", "model/gltf-binary");
			const stream = response.Body as Readable;
			stream.pipe(res);
		} catch (error) {
			next(error);
		}
	};

	// Only an Admin gives a digital twin expensive resources: a pipeline on GPU, knowledge base documents (RAG)
	private checkExpensiveSettings = (
		req: IRequestWithGroupRole,
		res: Response,
		data: { pipelineRequiresGpu?: boolean; knowledgeDocuments?: string[] },
		existent: { pipelineRequiresGpu?: boolean; knowledgeDocuments?: string[] } | null
	): void => {
		if (req.groupRole === "Admin") return;
		const gpuBefore = existent?.pipelineRequiresGpu === true;
		if (data.pipelineRequiresGpu !== undefined && data.pipelineRequiresGpu === true && !gpuBefore) {
			throw new HttpException(req, res, 403, "Only an administrator of the group can run a pipeline on GPU.");
		}
		if (data.knowledgeDocuments !== undefined) {
			const before = [...(existent?.knowledgeDocuments ?? [])].sort().join("\n");
			const after = [...(data.knowledgeDocuments ?? [])].sort().join("\n");
			if (before !== after) {
				throw new HttpException(
					req,
					res,
					403,
					"Only an administrator of the group can choose the knowledge base documents of a digital twin."
				);
			}
		}
	};

	private deleteDigitalTwinById = async (req: IRequestWithGroupRole, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!digitalTwin || Number(digitalTwin.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			}
			// an Editor: only without expensive resources; anyone: confirming the loss of its stored measurements
			await checkDeletion(
				req,
				res,
				"this digital twin",
				() => expensiveResourcesOfDigitalTwin(Number(digitalTwinId)),
				() => topicsOfDigitalTwin(Number(digitalTwinId))
			);
			await deleteDigitalTwinById(digitalTwin);
			const orgId = digitalTwin.orgId;
			const groupId = digitalTwin.groupId;
			const bucketFolder = `org_data/org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
			await removeFilesFromBucketFolder(bucketFolder);
			const message = { message: "Digital twin deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateDigitalTwinById = async (
		req: IRequestWithGroup & IRequestWithGroupRole,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData = req.body;
			const group = req.group;
			const { digitalTwinId } = req.params;
			const existentDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!existentDigitalTwin)
				throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			this.checkExpensiveSettings(req, res, digitalTwinData, existentDigitalTwin);
			const digitalTwinUpdated: IDigitalTwin & UpdateDigitalTwinDto = {
				...existentDigitalTwin,
				...digitalTwinData,
			};

			const isSensorsRefOk = await checkExistentSensorsRef(
				digitalTwinUpdated.assetId,
				digitalTwinUpdated.sensorsRef ?? []
			);
			if (!isSensorsRefOk) throw new HttpException(req, res, 500, "Some indicated sensor has not been defined");

			if (digitalTwinData.isGltfFileModified) {
				await verifyAndCorrectDigitalTwinReferences(group, digitalTwinUpdated);
			}
			await updateDigitalTwinById(parseInt(digitalTwinId, 10), digitalTwinUpdated);
			const message = { message: "Digital twin updated successfully" };
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
			this.checkExpensiveSettings(req as IRequestWithGroupRole, res, digitalTwinData, null);

			const existDigitalTwin = await getDigitalTwinByProp("digital_twin_uid", digitalTwinData.digitalTwinUid);
			if (existDigitalTwin)
				throw new HttpException(
					req,
					res,
					400,
					`A digital twin with uid: ${digitalTwinData.digitalTwinUid} already exist`
				);

			// the digital twin of a control room comes with it (Create control room)
			if (asset.context && asset.context !== "asset") {
				throw new HttpException(req, res, 400, "This asset is a control room: its digital twin is made with Create control room");
			}
			const isConstraintOk = await checkDigitalTwinConstraint(group.id, asset.id, "Asset");
			if (!isConstraintOk)
				throw new HttpException(
					req,
					res,
					400,
					"The unique constraint for groupId, assetId and scope is violated"
				);

			const isSensorsRefOk = await checkExistentSensorsRef(asset.id, digitalTwinData.sensorsRef);
			if (!isSensorsRefOk) throw new HttpException(req, res, 500, "Some indicated sensor has not been defined");

			const digitalTwin = await createDigitalTwin(group, asset, digitalTwinData);
			if (!digitalTwin)
				throw new HttpException(req, res, 400, "The entered value of dashboardUid is not correct");

			const response = {
				message: `A new digital twin has been created`,
				digitalTwinId: digitalTwin.id,
			};

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
		const slideId = scopeOfQuery(req.query.slide) ?? "";
		try {
			const message = {
				message: `The file ${fileName} has been successfully uploaded in the S3 bucket`,
			};
			if (folder === "femResJson") {
				await checkMaxNumberOfFemResFiles(req.digitalTwin, slideId);
				const context = {
					groupId: req.digitalTwin.groupId,
					digitalTwinId: req.digitalTwin.id,
					slideId,
				};
				await natsClient.jsPublish("femResults", "create", req.digitalTwin.id, context);
			} else if (folder === "gltfFile") {
				await checkNumberOfGltfFiles(req.digitalTwin, slideId);
			} else if (folder === "viewerImages") {
				// too big, or too many: the file uploaded is removed again
				const file = (req as unknown as { file?: { size?: number; key?: string } }).file;
				const keyBase = `org_data/org_${req.group.orgId}/group_${req.params.groupId}/digitalTwin_${req.params.digitalTwinId}`;
				const images = await getBucketFolderInfoFileList(`${keyBase}/viewerImages`);
				const tooBig = (file?.size ?? 0) > VIEWER_IMAGE_MAX_BYTES;
				if (tooBig || images.length > VIEWER_IMAGES_MAX_FILES) {
					await deleteBucketFile(`${keyBase}/viewerImages/${fileName}`);
					throw new HttpException(
						req,
						res,
						400,
						tooBig
							? `A viewer image must have at most ${VIEWER_IMAGE_MAX_BYTES / 1024 / 1024} MB.`
							: `A digital twin can have at most ${VIEWER_IMAGES_MAX_FILES} viewer images.`
					);
				}
			}
			infoLogger(req, res, 200, message.message);
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
		const { folder, fileName } = req.params;
		const slideId = scopeOfQuery(req.query.slide);
		if (slideId === null) return next(new HttpException(req, res, 400, "Invalid slide"));
		const fileKey = `${folderKeyBase(req.digitalTwin, folder, slideId)}/${folder}/${fileName}`;
		const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: fileKey,
		};

		try {
			const data = await s3Client.send(new GetObjectCommand(bucketParams));
			// the images of the viewer with their type (the browser shows them as images, SVG included)
			if (folder === "viewerImages") {
				res.setHeader("Content-Type", viewerImageContentType(fileName));
				res.setHeader("X-Content-Type-Options", "nosniff");
				res.setHeader("Content-Security-Policy", "script-src 'none'; sandbox");
			}
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
		const { folder } = req.params;
		const slideId = scopeOfQuery(req.query.slide);
		if (slideId === null) return next(new HttpException(req, res, 400, "Invalid slide"));
		const folderPath = `${folderKeyBase(req.digitalTwin, folder, slideId)}/${folder}`;
		try {
			const fileInfoList = await getBucketFolderInfoFileList(folderPath);
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
		const { folder, fileName } = req.params;
		const slideId = scopeOfQuery(req.query.slide);
		if (slideId === null) return next(new HttpException(req, res, 400, "Invalid slide"));
		const fileKey = `${folderKeyBase(req.digitalTwin, folder, slideId)}/${folder}/${fileName}`;
		try {
			await deleteBucketFile(fileKey);
			if (folder === "femResJson") {
				const context = {
					groupId: req.digitalTwin.groupId,
					digitalTwinId: req.digitalTwin.id,
					slideId,
				};
				await natsClient.jsPublish("femResults", "delete", req.digitalTwin.id, context);
			}
			const message = {
				message: `The file ${fileName} has been successfully deleted from the S3 bucket`,
			};
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinTopicsUserManaged = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let digitalTwinTopics: IDigitalTwinTopic[] = [];
			if (req.user.isGrafanaAdmin) {
				digitalTwinTopics = await getAllDTTopics();
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
					digitalTwinTopics = await getDTTopicsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(digitalTwinTopics);
		} catch (error) {
			next(error);
		}
	};

	private getDigitalTwinTopicsByDTid = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		const { digitalTwinId } = req.params;
		try {
			const digitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!digitalTwin) throw new ItemNotFoundException(req, res, "The digital twin", "id", digitalTwinId);
			const digitalTwinTopics = await getDTTopicsByDigitalTwinId(digitalTwin.id);
			res.status(200).send(digitalTwinTopics);
		} catch (error) {
			next(error);
		}
	};

	private createPipeline = async (
		req: IRequestWithAssetAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwinIdNum = parseInt(digitalTwinId, 10);
			const pipelineData: PipelineDto = req.body;
			await createDigitalTwinPipeline(digitalTwinIdNum, pipelineData, req.group.id);

			const response = {
				message: `A new pipeline has been created`,
			};
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private updatePipeline = async (
		req: IRequestWithAssetAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwinIdNum = parseInt(digitalTwinId, 10);
			const pipelineData: PipelineDto = req.body;
			await updateDigitalTwinPipeline(digitalTwinIdNum, pipelineData, req.group.id);

			const response = {
				message: `The pipeline has been updated`,
			};
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private deletePipeline = async (
		req: IRequestWithAssetAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwinIdNum = parseInt(digitalTwinId, 10);
			await deleteDigitalTwinPipeline(digitalTwinIdNum, req.group.id);

			const response = {
				message: `The pipeline has been deleted`,
			};
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private setPipelineAction = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwin = req.digitalTwin;
			const pipelineActionData: CreatePipelineActionDto = req.body;
			const { action, reinitialize } = pipelineActionData;

			await applyPipelineAction(digitalTwin, action, reinitialize, req.group.id);
			const response = {
				message: `The action '${action}' has been executed for pipeline of digital twin with id ${digitalTwin.id}`,
			};

			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	// The twin's own viewer settings (its lighting): everyone opening the twin starts from them
	private updateViewerSettings = async (
		req: IRequestWithDigitalTwinAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { viewerSettings } = req.body as UpdateViewerSettingsDto;
			if (Array.isArray(viewerSettings) || JSON.stringify(viewerSettings).length > 20000) {
				throw new HttpException(req, res, 400, "The viewer settings must be a JSON object of at most 20 kB");
			}
			await updateDigitalTwinViewerSettings(req.digitalTwin.id, viewerSettings);
			res.status(200).send({
				message: `The viewer settings of the digital twin ${req.digitalTwin.digitalTwinUid} have been saved`,
			});
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