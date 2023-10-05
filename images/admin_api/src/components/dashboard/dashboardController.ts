import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import { groupAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import groupExists from "../../middleware/groupExists.middleware";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getDashboardById, getAllDashboards, getDashboardsByGroupsIdArray } from "./dashboardDAL";
import IDashboard from "./dashboard.interface";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";

class DashboardController implements IController {
	public path = "/dashboard";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getDashboardsManagedByUser
			)
			.get(
				`${this.path}/:groupId/:dashboardId`,
				groupExists,
				groupAdminAuth,
				this.getDashboardById
			)

	}

	private getDashboardsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let dashboards: IDashboard[] = [];
			if (req.user.isGrafanaAdmin) {
				dashboards = await getAllDashboards();
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
					dashboards = await getDashboardsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(dashboards);
		} catch (error) {
			next(error);
		}
	};

	private getDashboardById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const dashboardId = parseInt(req.params.dashboardId, 10);
			const dashboard = await getDashboardById(dashboardId);
			if (!dashboard) throw new ItemNotFoundException(req, res, "The digital twin", "id", req.params.dashboardId);
			res.status(200).json(dashboard);
		} catch (error) {
			next(error);
		}
	};

}

export default DashboardController;