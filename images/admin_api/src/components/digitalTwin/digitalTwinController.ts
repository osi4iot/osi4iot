import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { basicGroupAdminAuth, groupAdminAuth, organizationAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import deviceAndGroupExist from "../../middleware/deviceAndGroupExist.middleware";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import { createDigitalTwin, deleteDigitalTwinById, getAllDigitalTwins, getDigitalTwinByProp, getDigitalTwinsByGroupId, getDigitalTwinsByGroupsIdArray, getDigitalTwinsByOrgId, updateDigitalTwinById } from "./digitalTwinDAL";
import IDigitalTwin from "./digitalTwin.interface";

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
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getDigitalTwinByProp
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
				if (groups.length !== 0) {
					const groupsIdArray = groups.map(group => group.id);
					digitalTwins = await getDigitalTwinsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(digitalTwins);
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

	private deleteDigitalTwinById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!digitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			await deleteDigitalTwinById(parseInt(digitalTwinId, 10));
			const message = { message: "Digital twin deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateDigitalTwinById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData = req.body;
			const { digitalTwinId } = req.params;
			const digitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
			if (!digitalTwin) throw new ItemNotFoundException("The digital twin", "id", digitalTwinId);
			const digitalTwinUpdate = { ...digitalTwin, ...digitalTwinData };
			await updateDigitalTwinById(parseInt(digitalTwinId, 10), digitalTwinUpdate);
			const message = { message: "Digital twin updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createDigitalTwin = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const digitalTwinData: CreateDigitalTwinDto = req.body;
			const deviceId = parseInt(req.params.deviceId, 10);
			let message: { message: string };
			const existDigitalTwin = await getDigitalTwinByProp("name", digitalTwinData.name)
			if (!existDigitalTwin) {
				await createDigitalTwin(deviceId, digitalTwinData);
				message = { message: `A new digital twin has been created` };
			} else {
				message = { message: `A digital twin with name: ${digitalTwinData.name} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidTopicPropName = (propName: string) => {
		const validPropName = ["id", "name"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default DigitalTwinController;