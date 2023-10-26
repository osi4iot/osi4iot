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
	checkInitialAssetGeolocation,
	createNewAsset,
	createNewAssetType,
	deleteAssetByPropName,
	deleteAssetTypeByPropName,
	getAllAssetTypes,
	getAllAssets,
	getAssetByPropName,
	getAssetTypeByPropName,
	getAssetTypesByOrgId,
	getAssetTypesByOrgsIdArray,
	getAssetsByGroupsIdArray,
	getAssetsByOrgId,
	updateAssetByPropName,
	updateAssetTypeByPropName,
} from "./assetDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IAsset from "./asset.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import infoLogger from "../../utils/logger/infoLogger";
import { getSensorsByAssetId } from "../sensor/sensorDAL";
import { deleteDashboardsByIdArray } from "../group/dashboardDAL";
import CreateAssetTypeDto from "./assetType.dto";
import IAssetType from "./assetType.interface";
import HttpException from "../../exceptions/HttpException";


class AssetController implements IController {
	public path = "/asset";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}_types/user_managed/`,
				userAuth,
				this.getAssetTypesManagedByUser
			)
			.get(
				`${this.path}_types_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getAssetTypesInOrg
			)
			.get(
				`${this.path}}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				this.getAssetTypeByProp
			)
			.delete(
				`${this.path}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				this.deleteAssetTypeByProp
			)
			.patch(
				`${this.path}_type/:orgId/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<CreateAssetTypeDto>(CreateAssetTypeDto, true),
				this.updateAssetTypeByProp
			)
			.post(
				`${this.path}_type/:orgId`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<CreateAssetTypeDto>(CreateAssetTypeDto),
				this.createAssetType
			)

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

	private getAssetTypesManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assetTypes: IAssetType[] = [];
			if (req.user.isGrafanaAdmin) {
				assetTypes = await getAllAssetTypes();
			} else {
				const orgIdsArray: number[] = [];
				const organizations = await getOrganizationsManagedByUserId(req.user.id);
				if (organizations.length !== 0) {
					orgIdsArray.push(...organizations.map(org => org.id));
				}
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				for (const group of groups) {
					if (orgIdsArray.indexOf(group.orgId) === -1) {
						orgIdsArray.push(group.orgId);
					}
				}
				assetTypes = await getAssetTypesByOrgsIdArray(orgIdsArray);
			}
			res.status(200).send(assetTypes);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTypesInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const assetTypes = await getAssetTypesByOrgId(req.organization.id);
			res.status(200).send(assetTypes);
		} catch (error) {
			next(error);
		}
	};

	private getAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			const assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			res.status(200).json(assetType);
		} catch (error) {
			next(error);
		}
	};

	private deleteAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			const assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			if(assetType.isPredefined)  throw new HttpException(req, res, 500, "Predefined asset type can not be deleted.");
			await deleteAssetTypeByPropName(propName, propValue);
			const message = { message: "Asset type deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateAssetTypeByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			const assetTypeData = req.body;
			if (!this.isValidAssetTypePropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgId = req.organization.id;
			let assetType = await getAssetTypeByPropName(orgId, propName, propValue);
			if (!assetType) throw new ItemNotFoundException(req, res, "The asset type", propName, propValue);
			assetType = { ...assetType, ...assetTypeData };
			await updateAssetTypeByPropName(propName, propValue, assetType);
			const message = { message: "Asset type updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private createAssetType = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let assetTypeData: CreateAssetTypeDto = req.body;
			const orgId = req.organization.id;
			assetTypeData = { ...assetTypeData, orgId };
			await createNewAssetType(assetTypeData);
			const message = { message: `A new asset type has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

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
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
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
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
			const sensors = getSensorsByAssetId(asset.id);
			const dashboardIds = (await sensors).map(sensor => sensor.dashboardId);
			await deleteAssetByPropName(propName, propValue);
			await deleteDashboardsByIdArray(dashboardIds);
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
			if (!this.isValidAssetPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			let asset = await getAssetByPropName(propName, propValue);
			if (!asset) throw new ItemNotFoundException(req, res, "The asset", propName, propValue);
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
			await checkInitialAssetGeolocation(req.group, assetData);
			await createNewAsset(req.group, assetData);
			const message = { message: `A new asset has been created` };
			infoLogger(req, res, 200, message.message);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidAssetPropName = (propName: string) => {
		const validPropName = ["id", "assetUid"];
		return validPropName.indexOf(propName) !== -1;
	};

	private isValidAssetTypePropName = (propName: string) => {
		const validPropName = ["id", "assetTypeUid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default AssetController;