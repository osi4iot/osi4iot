/* eslint-disable @typescript-eslint/require-await */
import passport from "passport";
import { NextFunction, Response } from "express";
import IRequestWithUser from "../interfaces/requestWithUser.interface";
import HttpException from "../exceptions/HttpException";
import { isThisUserAdminOfSomeOrg, isThisUserOrgAdmin } from "../components/user/userDAL";
import { getGroupByProp, haveThisUserGroupAdminPermissions } from "../components/group/groupDAL";
import IRequestWithUserAndGroup from "../components/group/interfaces/requestWithUserAndGroup.interface";
import { getNodeRedInstanceByProp } from "../components/nodeRedInstance/nodeRedInstanceDAL";

export const registerAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("register_jwt", { session: false }, (err, user, info) => {
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

export const adminForSomeOrganizationAuth = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
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

		let isAdminOfSomeOrganization = await isThisUserAdminOfSomeOrg(user.id);
		if (user.isGrafanaAdmin) isAdminOfSomeOrganization = true;

		if (user && !isAdminOfSomeOrganization) {
			return next(new HttpException(401, "You don't have organization administrator privileges."));
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

		let isOrganizationAdmin = await isThisUserOrgAdmin(user.id, parseInt(orgId, 10));
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

export const groupAdminNodeRedInstanceAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("nodered_instance_access_jwt", { session: false }, async (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}
		const { nriHash } = req.params;
		const nodeRedInstance = await getNodeRedInstanceByProp("nri_hash", nriHash);
		if (nodeRedInstance) {
			const group = await getGroupByProp("id", nodeRedInstance.groupId);
			req.group = group;
			let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, group.teamId, group.orgId);
			if (user.isGrafanaAdmin) isGroupAdmin = true;

			if (user && !isGroupAdmin) {
				return next(new HttpException(401, "You don't have group administrator privileges."));
			}
		} else {
			return next(new HttpException(404, `Not exits any nodered instance with hash= ${nriHash}`));
		}
		req.user = user;
		return next();
	})(req, res, next);
};


export const basicGroupAdminAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("local-login", { session: false }, async (err, user, info) => {
		if (info) {
			return next(new HttpException(401, info.message));
		}

		if (err) {
			return next(err);
		}

		if (!user) {
			return next(new HttpException(401, "You are not allowed to access."));
		}

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
}
