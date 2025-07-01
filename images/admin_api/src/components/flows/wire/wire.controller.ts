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
import { getFlowByPropName } from "../flow/flowDAL";
import { getNodeByPropName } from "../node/nodeDAL";
import CreateWireDto from "./wire.dto";
import {
	createNewWire,
	deleteWireByPropName,
	getAllWires,
	getWireByPropName,
	getWiresByFlowId,
	getWiresByGroupId,
	getWiresByGroupsIdArray,
	getWiresByNodeEndId,
	getWiresByNodeIniId,
	getWiresByOrgId,
} from "./wireDAL";
import IWire from "./wire.interface";
import InvalidPropValueException from "../../../exceptions/InvalidPropValueException";

class WireController implements IController {
	public path = "/wire";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getWiresManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getWiresInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getWiresInGroup
			)
			.get(
				`${this.path}s_in_flow/:groupId/:flowId`,
				groupExists,
				groupAdminAuth,
				this.getWiresInFlow
			)
			.get(
				`${this.path}s_for_node_ini/:groupId/:flowId/:nodeIniId`,
				groupExists,
				groupAdminAuth,
				this.getWiresForNodeIni
			)
			.get(
				`${this.path}s_for_node_end/:groupId/:flowId/:nodeEndId`,
				groupExists,
				groupAdminAuth,
				this.getWiresForNodeEnd
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getWireByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteWireByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateWireDto>(CreateWireDto),
				this.createWire
			);
	}

	private getWiresManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let wires: IWire[] = [];
			if (req.user.isGrafanaAdmin) {
				wires = await getAllWires();
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
					wires = await getWiresByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};

	private getWiresInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const wires = await getWiresByOrgId(req.organization.id);
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};

	private getWiresInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const wires = await getWiresByGroupId(req.group.id);
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};

	private getWiresInFlow = async (
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
			const wires = await getWiresByFlowId(flowIdNum);
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};
	private getWireByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidWirePropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const wire = await getWireByPropName(propName, propValue);
			if (!wire)
				throw new ItemNotFoundException(
					req,
					res,
					"The wire",
					propName,
					propValue
				);
			res.status(200).json(wire);
		} catch (error) {
			next(error);
		}
	};

	private deleteWireByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidWirePropName(propName))
				throw new InvalidPropNameExeception(req, res, propName);
			const wire = await getWireByPropName(propName, propValue);
			if (!wire)
				throw new ItemNotFoundException(
					req,
					res,
					"The wire",
					propName,
					propValue
				);
			await deleteWireByPropName(propName, propValue);
			const message = { message: "Wire deleted successfully" };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createWire = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const wireData: CreateWireDto = req.body;
			const nodeIniId = wireData.nodeIniId;
			const niniOutputIndex = wireData.niniOutputIndex;
			const nodeIni = await getNodeByPropName("id", nodeIniId);
			if (!nodeIni)
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					"id",
					nodeIniId.toString()
				);
			if (nodeIni.numOutputs <= niniOutputIndex + 1)
				throw new InvalidPropValueException(
					req,
					res,
					`The node with id ${nodeIniId} has only ${nodeIni.numOutputs} outputs`
				);
			const nodeEndId = wireData.nodeEndId;
			const nodeEnd = await getNodeByPropName("id", nodeEndId);
			if (!nodeEnd)
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					"id",
					nodeEndId.toString()
				);
			await createNewWire(wireData);
			const message = { message: `A new wire has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getWiresForNodeIni = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nodeIniId } = req.params;
			const nodeIni = await getNodeByPropName("id", nodeIniId);
			if (!nodeIni) {
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					"id",
					nodeIniId
				);
			}
			const nodeIniIdNum = parseInt(nodeIniId, 10);
			const wires = await getWiresByNodeIniId(nodeIniIdNum);
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};

	private getWiresForNodeEnd = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { nodeEndId } = req.params;
			const nodeEnd = await getNodeByPropName("id", nodeEndId);
			if (!nodeEnd) {
				throw new ItemNotFoundException(
					req,
					res,
					"The node",
					"id",
					nodeEndId
				);
			}
			const nodeEndIdNum = parseInt(nodeEndId, 10);
			const wires = await getWiresByNodeEndId(nodeEndIdNum);
			res.status(200).send(wires);
		} catch (error) {
			next(error);
		}
	};

	private isValidWirePropName = (propName: string) => {
		const validPropName = ["id", "wireUid"];
		return validPropName.indexOf(propName) !== -1;
	};
}

export default WireController;
