import passport from "passport";
import { NextFunction, Response } from "express";
// import OrganizationRepository from "../repositories/organization.repository";
import IRequestWithUser from "../interfaces/requestWithUser.interface";
import HttpException from "../exceptions/HttpException";
// import UserRepository from "../repositories/user.repository";
import isValidUUIDv4 from "../utils/validators/isValidUIIDv4";
import NotValidUUIDv4Exception from "../exceptions/NotValidUUIDv4Exception";
import GrafanaApi from "../GrafanaApi/grafanaApi";
import { isThisUserOrgAdmin } from "../components/user/userDAL";
import { haveThisUserGroupAdminPermissions } from "../components/group/groupDAL";
import IRequestWithUserAndGroup from "../components/group/interfaces/requestWithUserAndGroup.interface";

export const userAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("access_jwt", { session: false }, (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}

		if (err) {
			return next(err);
		}

		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const superAdminAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("access_jwt", { session: false }, (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}
		if (user && !user.isGrafanaAdmin) {
			return next(new HttpException(401, "You don't have administrator privileges."));
		}

		req.user = user;
		return next();
	})(req, res, next);
};

export const organizationAdminAuth = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}
		const { orgId } = req.params;

		let isOrganizationAdmin = await isThisUserOrgAdmin(user.id, parseInt(orgId,10));
		if (user.isGrafanaAdmin) isOrganizationAdmin = true;

		if (user && !isOrganizationAdmin) {
			return next(new HttpException(401, "You don't have organization administrator privileges."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const groupAdminAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}
		const { groupId } = req.params;
		const orgId = req.group.orgId;
		const teamId = req.group.teamId;

		let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, teamId, orgId);
		if (user.isGrafanaAdmin) isGroupAdmin = true;

		if (user && !isGroupAdmin) {
			return next(new HttpException(401, "You don't have group administrator privileges."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

