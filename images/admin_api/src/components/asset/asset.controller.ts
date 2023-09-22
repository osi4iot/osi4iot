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
import CreateAssetDto from "./asset.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import {
	createNewAsset,
	deleteAssetByPropName,
	getAllAssets,
	getAssetByPropName,
	getAssetsByGroupsIdArray,
	getAssetsByOrgId,
	updateAssetByPropName,
} from "./assetDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IAsset from "./asset.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";


class AssetController implements IController {
	public path = "/asset";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getAssetsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getAssetsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getAssetsInGroup
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getAssetByProp
			)
			.delete(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.deleteAssetByProp
			)
			.patch(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateAssetDto>(CreateAssetDto, true),
				this.updateAssetByProp
			)
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateAssetDto>(CreateAssetDto),
				this.createAsset
			)
	}

	private getAssetsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assets: IAsset[] = [];
			if (req.user.isGrafanaAdmin) {
				assets = await getAllAssets();
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
					assets = await getAssetsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assets = await getAssetsByOrgId(req.organization.id);
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assets = await getAssetsByOrgId(req.group.id);
			res.status(200).send(assets);
		} catch (error) {
			next(error);
		}
	};

	private getAssetByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(propName);
			const asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException("The asset", propName, propValue);
			res.status(200).json(asset);
		} catch (error) {
			next(error);
		}
	};

	private deleteAssetByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(propName);
			const asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException("The asset", propName, propValue);
			await deleteAssetByPropName(propName, propValue);
			const message = { message: "Asset deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateAssetByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const assetData = req.body;
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(propName);
			let asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException("The asset", propName, propValue);
			asset = { ...asset, ...assetData };
			await updateAssetByPropName(propName, propValue, asset);
			const message = { message: "Asset updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createAsset = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assetData: CreateAssetDto = req.body;
			await createNewAsset(req.group, assetData);
			const message = { message: `A new asset has been created` };
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidAssetPropName = (propName: string) => {
		const validPropName = ["id", "assetUid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default AssetController;