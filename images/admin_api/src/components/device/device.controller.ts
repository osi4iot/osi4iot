import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminAuth, organizationAdminAuth } from "../../middleware/auth.middleware";
import grafanaApi from "../../GrafanaApi";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateDeviceDto from "./device.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import { changeDeviceUidByUid, createDevice, deleteDeviceByProp, getDeviceByProp, getDevicesByGroupId, getDevicesByOrgId, updateDeviceByProp } from "./deviceDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import { getDashboardsDataWithRawSqlOfGroup, updateDashboardsDataRawSqlOfDevice } from "../group/dashboardDAL";

class DeviceController implements IController {
	public path = "/device";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getDevicesInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getDevicesInGroup
			)
			.patch(
				`${this.path}/:groupId/changeUid/:deviceId`,
				groupExists,
				groupAdminAuth,
				this.changeDeviceUid
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getDeviceByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteDeviceByProp
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateDeviceDto>(CreateDeviceDto),
				this.updateDeviceByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateDeviceDto>(CreateDeviceDto),
				this.createDevice
			)

	}

	private getDevicesInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const devices = await getDevicesByOrgId(req.organization.id);
			res.status(200).send(devices);
		} catch (error) {
			next(error);
		}
	};

	private getDevicesInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const devices = await getDevicesByGroupId(req.group.id);
			res.status(200).send(devices);
		} catch (error) {
			next(error);
		}
	};

	private getDeviceByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidDevicePropName(propName)) throw new InvalidPropNameExeception(propName);
			const device = await getDeviceByProp(propName, propValue);
			if (!device) throw new ItemNotFoundException("The device", propName, propValue);
			res.status(200).json(device);
		} catch (error) {
			next(error);
		}
	};

	private deleteDeviceByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidDevicePropName(propName)) throw new InvalidPropNameExeception(propName);
			const device = await getDeviceByProp(propName, propValue);
			if (!device) throw new ItemNotFoundException("The device", propName, propValue);
			await deleteDeviceByProp(propName, propValue);
			const message = "Device deleted successfully"
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateDeviceByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const deviceData = req.body;
			if (!this.isValidDevicePropName(propName)) throw new InvalidPropNameExeception(propName);
			let device = await getDeviceByProp(propName, propValue);
			if (!device) throw new ItemNotFoundException("The device", propName, propValue);
			device = { ...device, ...deviceData };
			await updateDeviceByProp(propName, propValue, device);
			const message = { message: "Device updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private changeDeviceUid = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { deviceId } = req.params;
			const device = await getDeviceByProp("id", deviceId);
			if (!device) throw new ItemNotFoundException("The device", "id", deviceId);
			const dashboards = await getDashboardsDataWithRawSqlOfGroup(req.group);
			const newDeviceUid = await changeDeviceUidByUid(device);
			await updateDashboardsDataRawSqlOfDevice(device, newDeviceUid, dashboards);
			const message = { newDeviceUid };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};


	private createDevice = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const deviceData: CreateDeviceDto = req.body;
			let message: { message: string };
			const existDevice = await getDeviceByProp("name", deviceData.name)
			if (!existDevice) {
				await createDevice(req.group, deviceData);
				message = { message: `A new device has been created` };
			} else {
				message = { message: `The device with name: ${deviceData.name} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidDevicePropName = (propName: string) => {
		const validPropName = ["id", "name", "deviceUid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default DeviceController;