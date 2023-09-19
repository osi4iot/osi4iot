import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import {
	groupAdminAuth,
	organizationAdminAuth,
	userAuth
} from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateSensorDto from "./sensor.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import HttpException from "../../exceptions/HttpException";
import ISensor from "./sensor.interface";
import {
	createNewSensor,
	deleteSensorByPropName,
	getAllSensors, getSensorByPropName,
	getSensorsByAssetId,
	getSensorsByGroupId,
	getSensorsByGroupsIdArray,
	getSensorsByOrgId,
	updateSensorByPropName
} from "./sensorDAL";

class SensorController implements IController {
	public path = "/sensor";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getSensorsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getSensorsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getSensorsInGroup
			)
			.get(
				`${this.path}s_in_group/:groupId/:assetId`,
				groupExists,
				groupAdminAuth,
				this.getSensorsInAsset
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getSensorByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteSensorByProp
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateSensorDto>(CreateSensorDto, true),
				this.updateSensorByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateSensorDto>(CreateSensorDto),
				this.createSensor
			)
	}

	private getSensorsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let sensors: ISensor[] = [];
			if (req.user.isGrafanaAdmin) {
				sensors = await getAllSensors();
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
					sensors = await getSensorsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(sensors);
		} catch (error) {
			next(error);
		}
	};

	private getSensorsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const sensors = await getSensorsByOrgId(req.organization.id);
			res.status(200).send(sensors);
		} catch (error) {
			next(error);
		}
	};

	private getSensorsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const sensors = await getSensorsByGroupId(req.group.id);
			res.status(200).send(sensors);
		} catch (error) {
			next(error);
		}
	};

	private getSensorsInAsset = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assetId = parseInt(req.params.assetId, 10);
			const sensors = await getSensorsByAssetId(assetId);
			res.status(200).send(sensors);
		} catch (error) {
			next(error);
		}
	};


	private getSensorByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidSensorPropName(propName)) throw new InvalidPropNameExeception(propName);
			const sensor = await getSensorByPropName(propName, propValue);
			if (!sensor) throw new ItemNotFoundException("The sensor", propName, propValue);
			res.status(200).json(sensor);
		} catch (error) {
			next(error);
		}
	};

	private deleteSensorByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidSensorPropName(propName)) throw new InvalidPropNameExeception(propName);
			const sensor = await getSensorByPropName(propName, propValue);
			if (!sensor) throw new ItemNotFoundException("The sensor", propName, propValue);
			await deleteSensorByPropName(propName, propValue);
			const message = { message: "Sensor deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateSensorByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const sensorData = req.body;
			if (!this.isValidSensorPropName(propName)) throw new InvalidPropNameExeception(propName);
			let sensor = await getSensorByPropName(propName, propValue);
			if (!sensor) throw new ItemNotFoundException("The sensor", propName, propValue);
			sensor = { ...sensor, ...sensorData };
			await updateSensorByPropName(propName, propValue, sensor);
			const message = { message: "Sensor updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createSensor = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const sensorData: CreateSensorDto = req.body;
			let message: { message: string };
			const existSensor = await getSensorByPropName("name", sensorData.name)
			if (!existSensor) {
				await createNewSensor(req.group, sensorData);
				message = { message: `A new sensor has been created` };
			} else {
				throw new HttpException(400, `The sensor with name: ${sensorData.name} already exist`);
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidSensorPropName = (propName: string) => {
		const validPropName = ["id", "name", "sensorUid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default SensorController;