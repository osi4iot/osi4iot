import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminMasterDeviceAuth, organizationAdminAuth, superAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import CreateMasterDeviceDto from "./masterDevice.dto";
import IMasterDevice from "./masterDevice.interface";
import {
	createMasterDevice,
	deleteMasterDeviceById,
	getAllMasterDevices,
	getMasterDeviceByProp,
	getMasterDevicesByOrgsIdArray,
	updateMasterDeviceByProp
} from "./masterDeviceDAL";
import HttpException from "../../exceptions/HttpException";

class MasterDeviceController implements IController {
	public path = "/master_device";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getMasterDevicesManagedByUser
			)
			.get(
				`${this.path}s`,
				superAdminAuth,
				this.getAllMasterDevices
			)
			.get(
				`${this.path}/:propName/:propValue`,
				superAdminAuth,
				this.getMasterDeviceByProp
			)
			.delete(
				`${this.path}/:masterDeviceId`,
				superAdminAuth,
				this.deleteMasterDeviceById
			)
			.patch(
				`${this.path}/:masterDeviceId`,
				superAdminAuth,
				validationMiddleware<CreateMasterDeviceDto>(CreateMasterDeviceDto, true),
				this.updateMasterDeviceById
			)
			.post(
				`${this.path}/`,
				superAdminAuth,
				validationMiddleware<CreateMasterDeviceDto>(CreateMasterDeviceDto),
				this.createMasterDevice
			)
			.get(
				"/master_device_authentication/:masterDeviceHash",
				groupAdminMasterDeviceAuth,
				this.masterDeviceAuthentication
			)

	}

	private getMasterDevicesManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let masterDevices: IMasterDevice[] = [];
			if (req.user.isGrafanaAdmin) {
				masterDevices = await getAllMasterDevices();
			} else {
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map(org => org.id);
					masterDevices = await getMasterDevicesByOrgsIdArray(orgIdsArray);
				}
			}
			res.status(200).send(masterDevices);
		} catch (error) {
			next(error);
		}
	};

	private getAllMasterDevices = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const masterDevices = await getAllMasterDevices();
			res.status(200).send(masterDevices);
		} catch (error) {
			next(error);
		}
	};


	private getMasterDeviceByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidMasterDevicePropName(propName)) throw new InvalidPropNameExeception(propName);
			const masterDevice = await getMasterDeviceByProp(propName, propValue);
			if (!masterDevice) throw new ItemNotFoundException("The master device", propName, propValue);
			res.status(200).json(masterDevice);
		} catch (error) {
			next(error);
		}
	};


	private deleteMasterDeviceById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { masterDeviceId } = req.params;
			const masterDevice = await getMasterDeviceByProp("id", masterDeviceId);
			if (!masterDevice) throw new ItemNotFoundException("The master device", "id", masterDeviceId);
			await deleteMasterDeviceById(parseInt(masterDeviceId, 10));
			const message = { message: "Master device deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateMasterDeviceById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { masterDeviceId } = req.params;
			const deviceData = req.body;
			let masterDevice = await getMasterDeviceByProp("id", parseInt(masterDeviceId, 10));
			masterDevice = { ...masterDevice, ...deviceData };
			await updateMasterDeviceByProp("id", parseInt(masterDeviceId, 10), masterDevice);
			const message = { message: "Device updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};


	private createMasterDevice = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const masterDeviceData: CreateMasterDeviceDto = req.body;
			let message: { message: string };
			const existMasterDevice = await getMasterDeviceByProp("md_hash", masterDeviceData.masterDeviceHash)
			if (!existMasterDevice) {
				const newMasterDevice = await createMasterDevice(masterDeviceData);
				if (newMasterDevice) {
					message = { message: `A new master device has been created` };
				} else {
					const mdHash = masterDeviceData.masterDeviceHash;
					const orgId = masterDeviceData.orgId;
					throw new HttpException(500, `The new master device in the org: ${orgId} with hash: ${mdHash} can not be creted`)
				}
			} else {
				message = { message: `The master device with hash: ${masterDeviceData.masterDeviceHash} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private masterDeviceAuthentication = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const user = req.user;
			const response = { user }
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private isValidMasterDevicePropName = (propName: string) => {
		const validPropName = ["id", "md_hash"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default MasterDeviceController;