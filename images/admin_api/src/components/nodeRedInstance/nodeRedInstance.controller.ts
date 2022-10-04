import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminNodeRedInstanceAuth, organizationAdminAuth, superAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import CreateNodeRedInstanceDto from "./nodeRedInstance.dto";
import { createNodeRedInstance, deleteNodeRedInstanceById, getAllNodeRedInstances, getNodeRedInstanceByProp, getNodeRedInstancesByOrgsIdArray, recoverNodeRedInstancesMarkedAsDeleted, updateNodeRedInstanceByProp } from "./nodeRedInstanceDAL";
import HttpException from "../../exceptions/HttpException";
import IRequestWithUserAndGroup from "../group/interfaces/requestWithUserAndGroup.interface";
import INodeRedInstance from "./nodeRedInstance.interface";
import RecoverNodeRedInstanceDto from "./recoverNodeRedInstances.dto";

class NodeRedInstanceController implements IController {
	public path = "/nodered_instance";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getNodeRedInstancesManagedByUser
			)
			.get(
				`${this.path}s`,
				superAdminAuth,
				this.getAllNodeRedInstances
			)
			.get(
				`${this.path}/:propName/:propValue`,
				superAdminAuth,
				this.getNodeRedInstanceByProp
			)
			.delete(
				`${this.path}/:nriId`,
				superAdminAuth,
				this.deleteNodeRedInstanceById
			)
			.patch(
				`${this.path}/recover_instances`,
				superAdminAuth,
				validationMiddleware<RecoverNodeRedInstanceDto>(RecoverNodeRedInstanceDto),
				this.recoverNodeRedInstances
			)
			.patch(
				`${this.path}/:nriId`,
				superAdminAuth,
				validationMiddleware<CreateNodeRedInstanceDto>(CreateNodeRedInstanceDto, true),
				this.updateNodeRedInstanceById
			)
			.post(
				`${this.path}/`,
				superAdminAuth,
				validationMiddleware<CreateNodeRedInstanceDto>(CreateNodeRedInstanceDto),
				this.createNodeRedInstance
			)
			.get(
				"/nodered_instance_authentication/:nriHash",
				groupAdminNodeRedInstanceAuth,
				this.nodeRedInstanceAuthentication
			)

	}

	private getNodeRedInstancesManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let nodeRedInstances: INodeRedInstance[] = [];
			if (req.user.isGrafanaAdmin) {
				nodeRedInstances = await getAllNodeRedInstances();
			} else {
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					const orgIdsArray = organizations.map(org => org.id);
					nodeRedInstances = await getNodeRedInstancesByOrgsIdArray(orgIdsArray);
				}
			}
			res.status(200).send(nodeRedInstances);
		} catch (error) {
			next(error);
		}
	};

	private getAllNodeRedInstances = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const nodeRedInstances = await getAllNodeRedInstances();
			res.status(200).send(nodeRedInstances);
		} catch (error) {
			next(error);
		}
	};


	private getNodeRedInstanceByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidNodeRedInstancePropName(propName)) throw new InvalidPropNameExeception(propName);
			const nodeRedInstance = await getNodeRedInstanceByProp(propName, propValue);
			if (!nodeRedInstance) throw new ItemNotFoundException("The nodered istance", propName, propValue);
			res.status(200).json(nodeRedInstance);
		} catch (error) {
			next(error);
		}
	};


	private deleteNodeRedInstanceById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nriId } = req.params;
			const nodeRedInstance = await getNodeRedInstanceByProp("id", parseInt(nriId, 10));
			if (!nodeRedInstance) throw new ItemNotFoundException("The NodeRed instance", "id", nriId);
			await deleteNodeRedInstanceById(parseInt(nriId, 10));
			const message = { message: "NodeRed instance deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateNodeRedInstanceById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nriId } = req.params;
			const nriData = req.body;
			let nodeRedInstance = await getNodeRedInstanceByProp("id", parseInt(nriId, 10));
			nodeRedInstance = { ...nodeRedInstance, ...nriData };
			await updateNodeRedInstanceByProp("id", parseInt(nriId, 10), nodeRedInstance);
			const message = { message: "NodeRed instance updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};


	private recoverNodeRedInstances = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nriIdArray } = req.body;
			await recoverNodeRedInstancesMarkedAsDeleted(nriIdArray);
			const message = { message: "NodeRed instance updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createNodeRedInstance = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const nriData: CreateNodeRedInstanceDto = req.body;
			let message: { message: string };
			const existNodeRedInstance = await getNodeRedInstanceByProp("nri_hash", nriData.nriHash)
			if (!existNodeRedInstance) {
				const newNodeRedInstance = await createNodeRedInstance(nriData);
				if (newNodeRedInstance) {
					message = { message: `A new NodeRed instance has been created` };
				} else {
					const mdHash = nriData.nriHash;
					const orgId = nriData.orgId;
					throw new HttpException(500, `The new NodeRed instance in the org: ${orgId} with hash: ${mdHash} can not be creted`)
				}
			} else {
				message = { message: `The NodeRed instance with hash: ${nriData.nriHash} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private nodeRedInstanceAuthentication = async (
		req: IRequestWithUserAndGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nriHash } = req.params;
			const existNodeRedInstance = await getNodeRedInstanceByProp("nri_hash", nriHash);
			if (!existNodeRedInstance) throw new ItemNotFoundException("The NodeRed instance", "nriHash", nriHash);
			const user = req.user;
			const groupId = req.group.id;
			const response = { user, groupId }
			res.status(200).send(response);
		} catch (error) {
			next(error);
		}
	};

	private isValidNodeRedInstancePropName = (propName: string) => {
		const validPropName = ["id", "nri_hash"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default NodeRedInstanceController;