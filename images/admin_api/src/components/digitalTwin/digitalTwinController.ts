import { Router, NextFunction, Request, Response } from "express";
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
import deviceAndGroupExist from "../../middleware/deviceAndGroupExist.middleware";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import {
	addMqttTopicsData,
	addDashboardUrls,
	createDigitalTwin,
	deleteDigitalTwinById,
	getAllDigitalTwins,
	getDigitalTwinByProp,
	getDigitalTwinGltfDataById,
	getDigitalTwinsByGroupId,
	getDigitalTwinsByGroupsIdArray,
	getDigitalTwinsByOrgId,
	getNumDigitalTwinsByDeviceId,
	getStateOfAllDigitalTwins,
	getStateOfDigitalTwinsByGroupsIdArray,
	updateDigitalTwinById,
	getAllDigitalTwinSimulators,
	getDigitalTwinSimulatorsByGroupsIdArray,
	addMqttTopicsToDigitalTwinSimulators,
	getDigitalTwinMqttTopicsInfoFromByDTIdsArray,
	generateDigitalTwinMqttTopics,
	verifyAndCorrectDigitalTwinTopics,
} from "./digitalTwinDAL";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import HttpException from "../../exceptions/HttpException";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IRequestWithUserAndDeviceAndGroup from "../group/interfaces/requestWithUserAndDeviceAndGroup.interface";

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
				`${this.path}_gltfdata/:groupId/:deviceId/:digitalTwinId`,
				deviceAndGroupExist,
				groupAdminAuth,
				this.getDigitalTwinGltfData
			)
			.delete(
				`${this.path}/:groupId/:deviceId/:digitalTwinId`,
				deviceAndGroupExist,
				groupAdminAuth,
				this.deleteDigitalTwinById
			)
			.patch(
				`${this.path}/:groupId/:deviceId/:digitalTwinId`,
				deviceAndGroupExist,
				groupAdminAuth,
				validationMiddleware<CreateDigitalTwinDto>(CreateDigitalTwinDto, true),
				this.updateDigitalTwinById
			)
			.post(
				`${this.path}/:groupId/:deviceId`,
				deviceAndGroupExist,
				groupAdminAuth,
				validationMiddleware<CreateDigitalTwinDto>(CreateDigitalTwinDto, true),
				this.createDigitalTwin
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
			const digitalTwinGltfData = await getDigitalTwinGltfDataById(parseInt(digitalTwinId, 10));
			if (!digitalTwinGltfData) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			const digitalTwinsExtended = await addMqttTopicsData(digitalTwinGltfData);
			res.status(200).send(digitalTwinsExtended);
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
			const message = { message: "Digital twin deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateDigitalTwinById = async (
		req: IRequestWithUserAndDeviceAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData = req.body;
			const device = req.device;
			const { digitalTwinId } = req.params;
			const existentDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!existentDigitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			const digitalTwinUpdate: IDigitalTwin = { ...existentDigitalTwin, ...digitalTwinData };
			const digitalTwinUpdated = await verifyAndCorrectDigitalTwinTopics(digitalTwinUpdate, device);
			await updateDigitalTwinById(parseInt(digitalTwinId, 10), digitalTwinUpdated);
			const message = { message: "Digital twin updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createDigitalTwin = async (
		req: IRequestWithUserAndDeviceAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData: CreateDigitalTwinDto = req.body;
			const device = req.device;
			const group = req.group;

			let message: { message: string };
			const existDigitalTwin = await getDigitalTwinByProp("digital_twin_uid", digitalTwinData.digitalTwinUid)
			if (!existDigitalTwin) {
				const numDigitalTwinsInDevice = await getNumDigitalTwinsByDeviceId(device.id);
				if (numDigitalTwinsInDevice === 12) {
					throw new HttpException(400, "The maximun number of digital twins by device is 12.");
				}
				const digitalTwin = await createDigitalTwin(group, device, digitalTwinData);
				if (digitalTwin) {
					message = { message: `A new digital twin has been created` };
				} else {
					throw new HttpException(400, "The dashboardUid inputted is not correct");
				}
			} else {
				message = { message: `A digital twin with uid: ${digitalTwinData.digitalTwinUid} already exist` };
			}
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
