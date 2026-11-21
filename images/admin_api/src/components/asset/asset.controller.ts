import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import {
	organizationAdminAuth,
	userAuth,
	groupViewerAuth,
	groupEditorAuth,
	groupAdminAuth,
	groupRoleRank,
} from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateAssetDto from "./asset.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import {
	checkInitialAssetGeolocation,
	checkSensorReferences,
	createNewAsset,
	createNewAssetType,
	deleteAssetByPropName,
	deleteAssetTopics,
	deleteAssetTypeByPropName,
	getAllAssetTopics,
	createAssetTopic,
	getAllAssetTypes,
	getAllAssets,
	getAssetByPropName,
	getAssetTopicsByGroupsIdArray,
	getAssetTopicsUsingAssetId,
	getAssetTypeByPropName,
	getAssetTypesByOrgId,
	getAssetTypesByOrgsIdArray,
	getAssetsByGroupsIdArray,
	getAssetsByOrgId,
	isAssetDescriptionTaken,
	updateAssetByPropName,
	updateAssetTypeByPropName,
} from "./assetDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IAsset from "./asset.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationByProp, getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import { controlRoomProblem, createControlRoom, isControlRoomAssetType, isVirtualContext } from "./controlRoom";
import { getControlRoomData } from "./controlRoomData";
import { getControlRoomLogs, MAX_PIPELINE_LOGS, pipelineLogLevelsOf } from "./controlRoomLogs";
import {
	getOrganizationOverview,
	MAX_UNAVAILABLE_STATUSES,
	overviewPeriodOf,
	unavailableStatusesOf,
} from "./organizationOverview";
import { isThisUserOrgAdmin } from "../user/userDAL";
import infoLogger from "../../utils/logger/infoLogger";
import { getSensorsByAssetId } from "../sensor/sensorDAL";
import { deleteDashboard, deleteDashboardsByIdArray } from "../group/dashboardDAL";
import CreateAssetTypeDto from "./assetType.dto";
import IAssetType from "./assetType.interface";
import HttpException from "../../exceptions/HttpException";
import { IRequestWithGroupRole } from "../../middleware/auth.middleware";
import { checkDeletion, expensiveResourcesOfAsset, topicsOfAsset } from "../../utils/permissions/deletePolicy";
import { measurementsProblems } from "../../utils/measurements/measurements";
import { createTopic } from "../topic/topicDAL";
import { assetTopicDescription, assetTopicsRefProblems } from "./assetTopicRefs";
import IAssetTopic from "./assetTopic.interface";
import { deleteTopicsOfDT, getDigitalTwinByProp } from "../digitalTwin/digitalTwinDAL";
import {
	ASSET_STATE_SNAPSHOT_MAX_MINUTES,
	getAssetStateHistorySettings,
	getAssetStateView,
	setAssetStateHistorySettings,
} from "./assetStateDAL";

class AssetController implements IController {
	public path = "/asset";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(`${this.path}_types/user_managed/`, userAuth, this.getAssetTypesManagedByUser)
			.get(
				`${this.path}_types_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getAssetTypesInOrg
			)
			.get(
				`${this.path}}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				this.getAssetTypeByProp
			)
			.delete(
				`${this.path}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				this.deleteAssetTypeByProp
			)
			.patch(
				`${this.path}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<CreateAssetTypeDto>(CreateAssetTypeDto, true),
				this.updateAssetTypeByProp
			)
			.post(
				`${this.path}_type/:orgId`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<CreateAssetTypeDto>(CreateAssetTypeDto),
				this.createAssetType
			);

		this.router
			.get(`${this.path}s/user_managed/`, userAuth, this.getAssetsManagedByUser)
			.get(`${this.path}s_in_org/:orgId/`, organizationAdminAuth, organizationExists, this.getAssetsInOrg)
			.get(`${this.path}s_in_group/:groupId`, groupExists, groupViewerAuth, this.getAssetsInGroup)
			.get(`${this.path}/:groupId/:propName/:propValue`, groupExists, groupViewerAuth, this.getAssetByProp)
			.delete(`${this.path}/:groupId/:propName/:propValue`, groupExists, groupEditorAuth, this.deleteAssetByProp)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<CreateAssetDto>(CreateAssetDto, true),
				this.updateAssetByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<CreateAssetDto>(CreateAssetDto),
				this.createAsset
			);

		this.router
			.get(`${this.path}_topics/user_managed/`, userAuth, this.getAssetTopicsManagedByUser)
			.get(
				`${this.path}_topics/:groupId/:assetId`,
				groupExists,
				groupViewerAuth,
				this.getAssetTopicsByAssetId
			)
			.post(
				`${this.path}_computed_topic/:groupId/:assetId`,
				groupExists,
				groupEditorAuth,
				this.createComputedTopic
			)
			// the Viewer's "Asset state" panel: the current state of the digital twin's asset (only reading: the
			// pipelines write it)
			.get(`${this.path}_state/:groupId/:digitalTwinId`, groupExists, groupViewerAuth, this.getAssetStateOfDigitalTwin)
			// what is kept of the asset's states (README, "Permissions": editors and administrators set it)
			.get(`${this.path}_state_history/:groupId/:assetId`, groupExists, groupViewerAuth, this.getAssetStateHistory)
			.put(`${this.path}_state_history/:groupId/:assetId`, groupExists, groupEditorAuth, this.putAssetStateHistory)
			// the control room of a group or the overview of an organization (in its default group): its virtual
			// asset and digital twin (controlRoom.ts; README, "Permissions": only the group's administrators)
			.post(`/control_room/:groupId`, groupExists, groupAdminAuth, this.postControlRoom)
			// what the panels of a group's control room show (any member of the group)
			.get(`/control_room/:groupId/:digitalTwinId`, groupExists, groupViewerAuth, this.getControlRoomData)
			// what the pipelines of the group logged in the last days (controlRoomLogs.ts; README, "Permissions": only the
			// group's editors and administrators)
			.get(`/control_room_logs/:groupId/:digitalTwinId`, groupExists, groupEditorAuth, this.getControlRoomLogs)
			// the indicators of the organization (organizationOverview.ts; README, "Permissions": only the organization's
			// administrators and the platform's administrators, though the overview lives in the default group)
			.get(`/organization_overview/:groupId/:digitalTwinId`, groupExists, groupViewerAuth, this.getOrganizationOverview);
	}

	private postControlRoom = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const context = (req.body as { context?: unknown } | undefined)?.context ?? "group";
			if (!isVirtualContext(context)) {
				throw new HttpException(req, res, 400, `context must be "group" or "organization"`);
			}
			const problem = controlRoomProblem(req.group, context);
			if (problem) throw new HttpException(req, res, 400, problem);
			const organization = await getOrganizationByProp("id", req.group.orgId);
			const room = await createControlRoom(req.group, context, organization?.name ?? `organization ${req.group.orgId}`);
			const what = context === "group" ? "control room of the group" : "overview of the organization";
			if (!room) throw new HttpException(req, res, 409, `The ${what} already exists`);
			const message = room.created === "both" ? `The ${what} has been created` : `The digital twin of the ${what} has been created again`;
			infoLogger(req, res, 200, message);
			res.status(201).json({ message, assetId: room.asset.id, digitalTwinId: room.digitalTwin.id });
		} catch (error) {
			next(error);
		}
	};

	// the digital twin of the request must be the group's control room (its asset, the virtual asset of context "group")
	private checkControlRoomTwin = async (req: IRequestWithGroup, res: Response): Promise<void> => {
		const digitalTwinId = parseInt(req.params.digitalTwinId, 10);
		const digitalTwin = Number.isInteger(digitalTwinId) ? await getDigitalTwinByProp("id", digitalTwinId) : null;
		if (!digitalTwin || Number(digitalTwin.groupId) !== Number(req.group.id)) {
			throw new ItemNotFoundException(req, res, "The digital twin", "id", req.params.digitalTwinId);
		}
		const asset = await getAssetByPropName("id", digitalTwin.assetId);
		if (asset?.context !== "group") {
			const text =
				asset?.context === "organization"
					? "The panels of the organization overview come with its indicators"
					: "This digital twin is not a group's control room";
			throw new HttpException(req, res, 400, text);
		}
	};

	private getControlRoomData = async (req: IRequestWithGroupRole, res: Response, next: NextFunction): Promise<void> => {
		try {
			await this.checkControlRoomTwin(req, res);
			// the pipeline logs only for the editors and administrators (README, "Permissions")
			const canSeeLogs = groupRoleRank(req.groupRole) >= groupRoleRank("Editor");
			res.status(200).json(await getControlRoomData(Number(req.group.id), req.group.groupUid, canSeeLogs));
		} catch (error) {
			next(error);
		}
	};

	private getControlRoomLogs = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			await this.checkControlRoomTwin(req, res);
			const levels = pipelineLogLevelsOf(req.query.levels);
			const limit = req.query.limit === undefined ? MAX_PIPELINE_LOGS : Number(req.query.limit);
			res.status(200).json(await getControlRoomLogs(Number(req.group.id), req.group.groupUid, levels, limit));
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationOverview = async (req: IRequestWithGroupRole, res: Response, next: NextFunction): Promise<void> => {
		try {
			const user = req.user as { id: number; isGrafanaAdmin?: boolean };
			const orgId = Number(req.group.orgId);
			if (user.isGrafanaAdmin !== true && !(await isThisUserOrgAdmin(user.id, orgId))) {
				// 403 (not 401): a 401 makes the browser renew its session and retry
				throw new HttpException(req, res, 403, "The organization overview is only for the organization's administrators");
			}
			const digitalTwinId = parseInt(req.params.digitalTwinId, 10);
			const digitalTwin = Number.isInteger(digitalTwinId) ? await getDigitalTwinByProp("id", digitalTwinId) : null;
			if (!digitalTwin || Number(digitalTwin.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The digital twin", "id", req.params.digitalTwinId);
			}
			const asset = await getAssetByPropName("id", digitalTwin.assetId);
			if (asset?.context !== "organization") {
				throw new HttpException(req, res, 400, "This digital twin is not the organization overview");
			}
			const unavailable = unavailableStatusesOf(req.query.unavailable);
			if (!unavailable) {
				throw new HttpException(req, res, 400, `unavailable: at most ${MAX_UNAVAILABLE_STATUSES} statuses, separated by commas`);
			}
			res.status(200).json(await getOrganizationOverview(orgId, overviewPeriodOf(req.query.period), unavailable));
		} catch (error) {
			next(error);
		}
	};

	// the asset types of the virtual assets are only theirs (controlRoom.ts)
	private checkNotControlRoomType = async (req: IRequestWithGroup, res: Response, assetTypeId: unknown): Promise<void> => {
		if (assetTypeId === undefined || assetTypeId === null) return;
		const assetType = await getAssetTypeByPropName(req.group.orgId, "id", Number(assetTypeId));
		if (assetType && isControlRoomAssetType(assetType.type)) {
			throw new HttpException(req, res, 400, `"${assetType.type}" is the type of a control room: choose another one`);
		}
	};

	// the asset of the route (groupExists has checked that it is of the group)
	private assetOfRoute = async (req: IRequestWithGroup, res: Response) => {
		const assetId = parseInt(req.params.assetId, 10);
		const asset = Number.isInteger(assetId) ? await getAssetByPropName("id", assetId) : null;
		if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
			throw new ItemNotFoundException(req, res, "The asset", "id", req.params.assetId);
		}
		return asset;
	};

	private getAssetStateHistory = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const asset = await this.assetOfRoute(req, res);
			res.status(200).json(await getAssetStateHistorySettings(req.group.groupUid, asset.assetUid));
		} catch (error) {
			next(error);
		}
	};

	private putAssetStateHistory = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const asset = await this.assetOfRoute(req, res);
			const body = (req.body ?? {}) as { statusChanges?: unknown; snapshotMinutes?: unknown };
			const minutes = body.snapshotMinutes ?? 0;
			if (typeof body.statusChanges !== "boolean") {
				throw new HttpException(req, res, 400, "statusChanges must be true or false");
			}
			if (
				typeof minutes !== "number" ||
				!Number.isInteger(minutes) ||
				minutes < 0 ||
				minutes > ASSET_STATE_SNAPSHOT_MAX_MINUTES
			) {
				throw new HttpException(
					req,
					res,
					400,
					`snapshotMinutes must be a whole number of minutes from 0 to ${ASSET_STATE_SNAPSHOT_MAX_MINUTES}`
				);
			}
			await setAssetStateHistorySettings(req.group.groupUid, asset.assetUid, body.statusChanges, minutes);
			res.status(200).json(await getAssetStateHistorySettings(req.group.groupUid, asset.assetUid));
		} catch (error) {
			next(error);
		}
	};

	private getAssetStateOfDigitalTwin = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const digitalTwinId = parseInt(req.params.digitalTwinId, 10);
			const digitalTwin = Number.isInteger(digitalTwinId) ? await getDigitalTwinByProp("id", digitalTwinId) : null;
			if (!digitalTwin || Number(digitalTwin.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The digital twin", "id", req.params.digitalTwinId);
			}
			const asset = await getAssetByPropName("id", digitalTwin.assetId);
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset of the digital twin", "id", String(digitalTwin.assetId));
			}
			const view = await getAssetStateView(req.group.groupUid, asset.assetUid, asset.description);
			res.status(200).json(view);
		} catch (error) {
			next(error);
		}
	};

	// A new dtm2pdb_n topic of an asset, for its computed sensors: the values a pipeline computes and stores in the
	// IoT database (IoTDB node, Insert). Devices do not publish there (MQTT: none).
	private createComputedTopic = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const assetId = parseInt(req.params.assetId, 10);
			const asset = Number.isInteger(assetId) ? await getAssetByPropName("id", assetId) : null;
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset", "id", req.params.assetId);
			}
			const refs = new Set((await getAssetTopicsUsingAssetId(assetId)).map((t) => t.topicRef));
			let n = 1;
			while (refs.has(`dtm2pdb_${n}`)) n++;
			const topicRef = `dtm2pdb_${n}`;
			const body = (req.body ?? {}) as { description?: unknown };
			const own = typeof body.description === "string" ? body.description.trim().slice(0, 120) : "";
			const description = assetTopicDescription("dtm2pdb", topicRef, own || "Computed measurements", asset.assetUid);
			const topic = await createTopic(req.group.id, { topicType: "dtm2pdb", description, mqttAccessControl: "None" });
			await createAssetTopic(assetId, topic.id, topicRef);
			const message = `Topic ${topicRef} created for the computed sensors of the asset`;
			infoLogger(req, res, 200, message);
			res.status(200).json({ message, topicRef, topicId: topic.id });
		} catch (error) {
			next(error);
		}
	};

	private getAssetTypesManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assetTypes: IAssetType[] = [];
			if (req.user.isGrafanaAdmin) {
				assetTypes = await getAllAssetTypes();
			} else {
				const orgIdsArray: number[] = [];
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					orgIdsArray.push(...organizations.map((org) => org.id));
				}
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				for (const group of groups) {
					if (orgIdsArray.indexOf(group.orgId) === -1) {
						orgIdsArray.push(group.orgId);
					}
				}
				assetTypes = await getAssetTypesByOrgsIdArray(orgIdsArray);
			}
			res.status(200).send(assetTypes);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTypesInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assetTypes = await getAssetTypesByOrgId(req.organization.id);
			res.status(200).send(assetTypes);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			const assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			res.status(200).json(assetType);
		} catch (error) {
			next(error);
		}
	};

	private deleteAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			const assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			if (assetType.isPredefined)
				throw new HttpException(req, res, 500, "Predefined asset type can not be deleted.");
			await deleteAssetTypeByPropName(propName, propValue);
			const message = { message: "Asset type deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const assetTypeData = req.body;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			let assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			if (isControlRoomAssetType(assetType.type)) {
				throw new HttpException(req, res, 400, `"${assetType.type}" is the type of the control rooms: it cannot be changed`);
			}
			assetType = { ...assetType, ...assetTypeData };
			await updateAssetTypeByPropName(propName, propValue, assetType);
			const message = { message: "Asset type updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createAssetType = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assetTypeData: CreateAssetTypeDto = req.body;
			const orgId = req.organization.id;
			if (isControlRoomAssetType(assetTypeData.type?.trim())) {
				throw new HttpException(req, res, 400, `"${assetTypeData.type}" is the name of the control rooms' type: choose another one`);
			}
			assetTypeData = { ...assetTypeData, orgId };
			await createNewAssetType(assetTypeData);
			const message = { message: `A new asset type has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getAssetsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assets: IAsset[] = [];
			if (req.user.isGrafanaAdmin) {
				assets = await getAllAssets();
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
					assets = await getAssetsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assets = await getAssetsByOrgId(req.organization.id);
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetsInGroup = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const assets = await getAssetsByOrgId(req.group.id);
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetByProp = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const asset = await getAssetByPropName(propName, propValue);
			// only an asset of the route's group (the group checked by groupViewerAuth)
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
			}
			res.status(200).json(asset);
		} catch (error) {
			next(error);
		}
	};

	private deleteAssetByProp = async (req: IRequestWithGroupRole, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const asset = await getAssetByPropName(propName, propValue);
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
			}
			// an Editor: only without expensive resources; anyone: confirming the loss of its stored measurements
			await checkDeletion(
				req,
				res,
				"this asset",
				() => expensiveResourcesOfAsset(asset.id),
				() => topicsOfAsset(asset.id)
			);
			const sensors = await getSensorsByAssetId(asset.id);
			const dashboardIds = sensors.map((sensor) => sensor.dashboardId);
			const digitalTwin = await getDigitalTwinByProp("asset_id", asset.id);
			if (digitalTwin) {
				await deleteTopicsOfDT(digitalTwin.id);
				await deleteDashboard(digitalTwin.dashboardId);
			}
			await deleteAssetTopics(asset.id);
			await deleteAssetByPropName(propName, propValue);
			await deleteDashboardsByIdArray(dashboardIds);
			const message = { message: "Asset deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateAssetByProp = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const assetData = req.body;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			let asset = await getAssetByPropName(propName, propValue);
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
			}
			if (typeof assetData.description === "string") {
				assetData.description = assetData.description.trim();
				await this.checkAssetDescription(req, res, asset.groupId, assetData.description, asset.id);
			}
			if (isVirtualContext(asset.context)) {
				// a control room keeps its type (its icon), and its context never changes
				delete assetData.assetTypeId;
			} else {
				await this.checkNotControlRoomType(req, res, assetData.assetTypeId);
			}
			delete assetData.context;
			asset = { ...asset, ...assetData };
			await updateAssetByPropName(propName, propValue, asset);
			const message = { message: "Asset updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	// Assets are chosen by their description: it must be given and not be
	// another asset's of the group.
	private checkAssetDescription = async (
		req: Request,
		res: Response,
		groupId: number,
		description: string,
		exceptAssetId: number | null = null
	): Promise<void> => {
		if (description === "") {
			throw new HttpException(req, res, 400, "The asset description is required");
		}
		if (await isAssetDescriptionTaken(groupId, description, exceptAssetId)) {
			throw new HttpException(
				req,
				res,
				400,
				`The group already has an asset with the description "${description}". Assets are chosen by their description: use a different one.`
			);
		}
	};

	private createAsset = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const assetData: CreateAssetDto = req.body;
			assetData.description = (assetData.description || "").trim();
			await this.checkAssetDescription(req, res, req.group.id, assetData.description);
			await checkInitialAssetGeolocation(req.group, assetData);
			await this.checkNotControlRoomType(req, res, assetData.assetTypeId);
			// the name of each topic reference says its type (dev2pdb_n, dev2dtm_n, dtm2dev_n): pipelines find them by it
			const topicProblems = assetTopicsRefProblems(assetData.topicsRef ?? [], assetData.sensorsRef ?? []);
			if (topicProblems.length !== 0) {
				throw new HttpException(req, res, 400, topicProblems.join(". "));
			}
			for (const sensor of assetData.sensorsRef ?? []) {
				const problems = measurementsProblems(sensor.measurements ?? sensor.payloadJsonSchema);
				if (problems.length !== 0) {
					throw new HttpException(req, res, 400, `Measurements of the sensor ${sensor.sensorRef ?? ""}: ${problems.join("; ")}`);
				}
			}
			// 400, not 401: a 401 makes the browser renew its session (and retry) as if the token had expired
			const wrongSensorTypes = await checkSensorReferences(req.group, assetData);
			if (wrongSensorTypes.length !== 0) {
				const errorMessage = `The organization of the group has no sensor type for: ${wrongSensorTypes.join(", ")}`;
				throw new HttpException(req, res, 400, errorMessage);
			}
			await createNewAsset(req.group, assetData);
			const message = { message: `A new asset has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTopicsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assetTopics: IAssetTopic[] = [];
			if (req.user.isGrafanaAdmin) {
				assetTopics = await getAllAssetTopics();
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
					assetTopics = await getAssetTopicsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(assetTopics);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTopicsByAssetId = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { assetId } = req.params;
			const id = parseInt(assetId, 10);
			const asset = Number.isInteger(id) ? await getAssetByPropName("id", id) : null;
			if (!asset || Number(asset.groupId) !== Number(req.group.id)) {
				throw new ItemNotFoundException(req, res, "The asset", "id", assetId);
			}
			const assetTopics = await getAssetTopicsUsingAssetId(id);
			if (!assetTopics) throw new ItemNotFoundException(req, res, "The asset topics", "assetId", assetId);
			res.status(200).json(assetTopics);
		} catch (error) {
			next(error);
		}
	};

	private isValidAssetPropName = (propName: string) => {
		const validPropName = ["id", "assetUid"];
		return validPropName.indexOf(propName) !== -1;
	};

	private isValidAssetTypePropName = (propName: string) => {
		const validPropName = ["id", "assetTypeUid"];
		return validPropName.indexOf(propName) !== -1;
	};
}

export default AssetController;
