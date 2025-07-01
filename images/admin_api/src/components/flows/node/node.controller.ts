import { Router, NextFunction, Request, Response } from "express";
import IController from "../../../interfaces/controller.interface";
import {
	groupAdminAuth,
	organizationAdminAuth,
	userAuth,
} from "../../../middleware/auth.middleware";
import organizationExists from "../../../middleware/organizationExists.middleware";
import groupExists from "../../../middleware/groupExists.middleware";
import validationMiddleware from "../../../middleware/validation.middleware";
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
import UpdateNodeDto from "./nodeUpdate.dto";
import CreateNodeDto from "./node.dto";
import INode from "./node.interface";
import {
	createNewNode,
	deleteNodeByPropName,
	getAllNodes,
	getNodeByPropName,
	getNodesByFlowId,
	getNodesByGroupId,
	getNodesByGroupsIdArray,
	getNodesByOrgId,
	updateNodeByPropName,
} from "./nodeDAL";
import { getFlowByPropName } from "../flow/flowDAL";

class NodeController implements IController {
	public path = "/node";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getNodesManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getNodesInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getNodesInGroup
			)
			.get(
				`${this.path}s_in_flow/:groupId/:flowId`,
				groupExists,
				groupAdminAuth,
				this.getNodesInFlow
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getNodeByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteNodeByProp
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateNodeDto>(UpdateNodeDto, true),
				this.updateNodeByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateNodeDto>(CreateNodeDto),
				this.createNode
			);
	}

	private getNodesManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let nodes: INode[] = [];
			if (req.user.isGrafanaAdmin) {
				nodes = await getAllNodes();
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
					nodes = await getNodesByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(nodes);
		} catch (error) {
			next(error);
		}
	};

	private getNodesInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const nodes = await getNodesByOrgId(req.organization.id);
			res.status(200).send(nodes);
		} catch (error) {
			next(error);
		}
	};

	private getNodesInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const nodes = await getNodesByGroupId(req.group.id);
			res.status(200).send(nodes);
		} catch (error) {
			next(error);
		}
	};

	private getNodesInFlow = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { flowId } = req.params;
			const flow = await getFlowByPropName("id", flowId);
			if (!flow) {
				throw new ItemNotFoundException(
					req,
					res,
					"The flow",
					"id",
					flowId
				);
			}
			const flowIdNum = parseInt(flowId, 10);
			const nodes = await getNodesByFlowId(flowIdNum);
			res.status(200).send(nodes);
		} catch (error) {
			next(error);
		}
	};

	private getNodeByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidNodePropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const node = await getNodeByPropName(propName, propValue);
			if (!node)
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					propName,
					propValue
				);
			res.status(200).json(node);
		} catch (error) {
			next(error);
		}
	};

	private deleteNodeByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidNodePropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const node = await getNodeByPropName(propName, propValue);
			if (!node)
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					propName,
					propValue
				);
			await deleteNodeByPropName(propName, propValue);
			const message = { message: "Node deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateNodeByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const nodeData = req.body;
			if (!this.isValidNodePropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const existingNode = await getNodeByPropName(propName, propValue);
			if (!existingNode)
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					propName,
					propValue
				);
			const node = { ...existingNode, ...nodeData };
			await updateNodeByPropName(propName, propValue, node);
			const message = { message: "Node updated successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createNode = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const nodeData: CreateNodeDto = req.body;
			await createNewNode(nodeData);
			const message = { message: `A new node has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidNodePropName = (propName: string) => {
		const validPropName = ["id", "nodeUid"];
		return validPropName.indexOf(propName) !== -1;
	};
}

export default NodeController;
