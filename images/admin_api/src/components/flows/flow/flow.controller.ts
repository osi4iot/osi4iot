import { Router, NextFunction, Request, Response } from "express";
import {
	createNewFlow,
	getAllFlows,
	getFlowByPropName,
	updateFlowByPropName,
	deleteFlowByPropName,
	getFlowsByOrgId,
	getFlowsByGroupsIdArray,
} from "./flowDAL";
import IFlow from "./flow.inteface";
import UpdateFlowDto from "./flowUpdate.dto";
import IController from "../../../interfaces/controller.interface";
import {
	groupAdminAuth,
	organizationAdminAuth,
	userAuth,
} from "../../../middleware/auth.middleware";
import organizationExists from "../../../middleware/organizationExists.middleware";
import groupExists from "../../../middleware/groupExists.middleware";
import validationMiddleware from "../../../middleware/validation.middleware";
import CreateFlowDto from "./flow.dto";
import IRequestWithUser from "../../../interfaces/requestWithUser.interface";
import {
	getAllGroupsInOrgArray,
	getGroupsThatCanBeEditatedAndAdministratedByUserId,
} from "../../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../../organization/organizationDAL";
import IRequestWithOrganization from "../../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../../group/interfaces/requestWithGroup.interface";
import ItemNotFoundException from "../../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../../exceptions/InvalidPropNameExeception";
import infoLogger from "../../../utils/logger/infoLogger";

class FlowController implements IController {
	public path = "/flow";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getFlowsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getFlowsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getFlowsInGroup
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getFlowByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteFlowByProp
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateFlowDto>(UpdateFlowDto, true),
				this.updateFlowByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateFlowDto>(CreateFlowDto),
				this.createFlow
			)
			.post(
				`${this.path}_full/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateFlowDto>(CreateFlowDto),
				this.createFullFlow
			);
	}

	private getFlowsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let flows: IFlow[] = [];
			if (req.user.isGrafanaAdmin) {
				flows = await getAllFlows();
			} else {
				const groups =
					await getGroupsThatCanBeEditatedAndAdministratedByUserId(
						req.user.id
					);
				const organizations = await getOrganizationsManagedByUserId(
					req.user.id
				);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map((org) => org.id);
					const groupsInOrgs = await getAllGroupsInOrgArray(
						orgIdsArray
					);
					const groupsIdArray = groups.map((group) => group.id);
					groupsInOrgs.forEach((groupInOrg) => {
						if (groupsIdArray.indexOf(groupInOrg.id) === -1)
							groups.push(groupInOrg);
					});
				}
				if (groups.length !== 0) {
					const groupsIdArray = groups.map((group) => group.id);
					flows = await getFlowsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(flows);
		} catch (error) {
			next(error);
		}
	};

	private getFlowsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const flows = await getFlowsByOrgId(req.organization.id);
			res.status(200).send(flows);
		} catch (error) {
			next(error);
		}
	};

	private getFlowsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const flows = await getFlowsByOrgId(req.group.id);
			res.status(200).send(flows);
		} catch (error) {
			next(error);
		}
	};

	private getFlowByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidFlowPropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const flow = await getFlowByPropName(propName, propValue);
			if (!flow)
				throw new ItemNotFoundException(
					req,
					res,
					"The flow",
					propName,
					propValue
				);
			res.status(200).json(flow);
		} catch (error) {
			next(error);
		}
	};

	private deleteFlowByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidFlowPropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const flow = await getFlowByPropName(propName, propValue);
			if (!flow)
				throw new ItemNotFoundException(
					req,
					res,
					"The flow",
					propName,
					propValue
				);
			await deleteFlowByPropName(propName, propValue);
			const message = { message: "Flow deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateFlowByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const flowData = req.body;
			if (!this.isValidFlowPropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			let flow = await getFlowByPropName(propName, propValue);
			if (!flow)
				throw new ItemNotFoundException(
					req,
					res,
					"The flow",
					propName,
					propValue
				);
			flow = { ...flow, ...flowData };
			await updateFlowByPropName(propName, propValue, flow);
			const message = { message: "Flow updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createFlow = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const flowData: CreateFlowDto = req.body;
			await createNewFlow(flowData);
			const message = { message: `A new flow has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private createFullFlow = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const flowData: CreateFlowDto = req.body;
			await createNewFlow(flowData);
			const message = { message: `A new flow has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidFlowPropName = (propName: string) => {
		const validPropName = ["id", "flowUid"];
		return validPropName.indexOf(propName) !== -1;
	};
}

export default FlowController;
