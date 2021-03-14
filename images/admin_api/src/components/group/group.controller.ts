import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import { organizationAdminAuth, superAdminAuth } from "../../middleware/auth.middleware";
import IRequestWithOrganization from "../organization/requestWithOrganization.interface";
import grafanaApi from "../../GrafanaApi";
import AlreadyExistingItemException from "../../exceptions/AlreadyExistingItemException";
import CreateGroupDto from "./group.dto";
import { createGroup, deleteGroup, getAllGroupsInOrganization, getGroupByProp } from "./groupDAL";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import { getOrganizationKey } from "../organization/organizationDAL";

class GroupController implements IController {
	public path = "/group";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getAllGroupsInOrg
			)
			.post(
				`${this.path}/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<CreateGroupDto>(CreateGroupDto),
				this.createGroup
			);


		this.router
			.get(
				`${this.path}/:orgId/:propName/:propValue/`,
				organizationAdminAuth,
				organizationExists,
				this.getGroupByProp
			)
			.delete(
				`${this.path}/:orgId/:propName/:propValue/`,
				organizationAdminAuth,
				organizationExists,
				this.deleteGroupByProp
			);
	}

	private createGroup = async (req: IRequestWithOrganization, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupInput: CreateGroupDto = req.body;
			const orgId = parseInt(req.params.orgId, 10);
			const existentGroup = getGroupByProp("name", groupInput.name);
			if (existentGroup) throw new AlreadyExistingItemException("A", "Group", ["name"], [groupInput.name]);
			const groupCreated = await createGroup(orgId, groupInput)
			const groupHash = `Group_${groupCreated.groupUid}`;
			const tableHash = `Table_${groupCreated.groupUid}`;
			const isPrivate = true;
			const group = { ...groupInput, isPrivate, groupHash, tableHash };
			const message = { message: `A new group has been created successfully`, group }
			res.status(201).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getAllGroupsInOrg = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const orgId = parseInt(req.params.orgId, 10);
			const groups = await getAllGroupsInOrganization(orgId);
			res.status(200).send(groups);
		} catch (error) {
			next(error);
		}
	};

	private getGroupByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidGroupPropName(propName)) throw new InvalidPropNameExeception(propName);
			const group = await getGroupByProp(propName, propValue);
			if (!group) throw new ItemNotFoundException("The group", propName, propValue);
			res.status(200).send(group);
		} catch (error) {
			next(error);
		}
	};

	private deleteGroupByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const orgId = parseInt(req.params.orgId, 10);
			if (!this.isValidGroupPropName(propName)) throw new InvalidPropNameExeception(propName);
			const group = await getGroupByProp(propName, propValue);
			if (!group) throw new ItemNotFoundException("The group", propName, propValue);
			const orgKey = await getOrganizationKey(orgId);
			await deleteGroup(group, orgKey);
			res.status(200).send(group);
		} catch (error) {
			next(error);
		}
	};

	private isValidGroupPropName = (propName: string) => {
		const validPropName = ["id", "name", "acronym"];
		return validPropName.indexOf(propName) !== -1;
	}

}

export default GroupController;