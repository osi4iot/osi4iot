/* eslint-disable @typescript-eslint/require-await */
import passport from "passport";
import { NextFunction, Response } from "express";
import IRequestWithUser from "../interfaces/requestWithUser.interface";
import HttpException from "../exceptions/HttpException";
import { isThisUserAdminOfSomeOrg, isThisUserOrgAdmin } from "../components/user/userDAL";
import { haveThisUserGroupAdminPermissions, isThisUserGroupMember, userRoleInGroup } from "../components/group/groupDAL";
import IRequestWithUserAndGroup from "../components/group/interfaces/requestWithUserAndGroup.interface";

export const registerAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("register_jwt", { session: false }, (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}

		if (err) {
			return next(err);
		}

		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};


export const userAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("access_jwt", { session: false }, (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}

		if (err) {
			return next(err);
		}

		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const superAdminAuth = (req: IRequestWithUser, res: Response, next: NextFunction): void => {
	passport.authenticate("access_jwt", { session: false }, (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		if (user && !user.isGrafanaAdmin) {
			return next(new HttpException(req, res, 401, "You don't have administrator privileges."));
		}

		req.user = user;
		return next();
	})(req, res, next);
};

export const adminForSomeOrganizationAuth = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}

		let isAdminOfSomeOrganization = await isThisUserAdminOfSomeOrg(user.id);
		if (user.isGrafanaAdmin) isAdminOfSomeOrganization = true;

		if (user && !isAdminOfSomeOrganization) {
			return next(new HttpException(req, res, 401, "You don't have organization administrator privileges."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const organizationAdminAuth = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		const { orgId } = req.params;

		let isOrganizationAdmin = await isThisUserOrgAdmin(user.id, parseInt(orgId, 10));
		if (user.isGrafanaAdmin) isOrganizationAdmin = true;

		if (user && !isOrganizationAdmin) {
			return next(new HttpException(req, res, 401, "You don't have organization administrator privileges."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const groupAdminAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		const orgId = req.group.orgId;
		const teamId = req.group.teamId;

		let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, teamId, orgId);
		if (user.isGrafanaAdmin) isGroupAdmin = true;

		if (user && !isGroupAdmin) {
			return next(new HttpException(req, res, 401, "You don't have group administrator privileges."));
		}
		req.user = user;
		return next();
	})(req, res, next);
};

export const basicGroupAdminAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("local-login", { session: false }, async (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}

		if (err) {
			return next(err);
		}

		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}

		const orgId = req.group.orgId;
		const teamId = req.group.teamId;

		let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, teamId, orgId);
		if (user.isGrafanaAdmin) isGroupAdmin = true;

		if (user && !isGroupAdmin) {
			return next(new HttpException(req, res, 401, "You don't have group administrator privileges."));
		}

		req.user = user;
		return next();
	})(req, res, next);
}

// A member of the group (any role), an administrator of the group or of its organization, or a platform
// administrator: what the users of a digital twin's chat need (e.g. to attach files to it).
export const groupMemberAuth = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
	passport.authenticate("access_jwt", { session: false }, async (err: any, user: any, info: any) => {
		if (info) {
			return next(new HttpException(req, res, 401, info.message));
		}
		if (err) {
			return next(err);
		}
		if (!user) {
			return next(new HttpException(req, res, 401, "You are not allowed to access."));
		}
		try {
			const { orgId, teamId } = req.group;
			const allowed =
				user.isGrafanaAdmin === true ||
				(await isThisUserGroupMember(user.id, teamId)) ||
				(await haveThisUserGroupAdminPermissions(user.id, teamId, orgId));
			if (!allowed) {
				return next(new HttpException(req, res, 403, "You are not a member of this group."));
			}
		} catch (error) {
			return next(error);
		}
		req.user = user;
		return next();
	})(req, res, next);
};

// ── Roles in a group ─────────────────────────────────────────────────────────────────────────────────────────────
// Viewer < Editor < Admin (README, "Permissions"). The administrators of the group's organization and the platform
// administrators are Admin of every group. groupAdminAuth is the same as groupRoleAuth("Admin").
export type GroupRole = "Viewer" | "Editor" | "Admin";

const GROUP_ROLE_RANK: Record<GroupRole, number> = { Viewer: 1, Editor: 2, Admin: 3 };

export const groupRoleRank = (role: GroupRole | null | undefined): number => (role ? GROUP_ROLE_RANK[role] : 0);

// The role of the user of a request in its group (set by groupRoleAuth)
export interface IRequestWithGroupRole extends IRequestWithUserAndGroup {
	groupRole?: GroupRole;
}

export const groupRoleOfUser = async (
	user: { id: number; isGrafanaAdmin?: boolean },
	group: { orgId: number; teamId: number }
): Promise<GroupRole | null> => {
	if (user.isGrafanaAdmin === true) return "Admin";
	if (await isThisUserOrgAdmin(user.id, group.orgId)) return "Admin";
	return userRoleInGroup(user.id, group.teamId);
};

export const groupRoleAuth =
	(minRole: GroupRole) =>
	async (req: IRequestWithGroupRole, res: Response, next: NextFunction): Promise<void> => {
		passport.authenticate("access_jwt", { session: false }, async (err: any, user: any, info: any) => {
			if (info) {
				return next(new HttpException(req, res, 401, info.message));
			}
			if (err) {
				return next(err);
			}
			if (!user) {
				return next(new HttpException(req, res, 401, "You are not allowed to access."));
			}
			try {
				const role = await groupRoleOfUser(user, req.group);
				if (groupRoleRank(role) < GROUP_ROLE_RANK[minRole]) {
					const needed = minRole === "Viewer" ? "a member of this group" : `${minRole.toLowerCase()} of this group`;
					// 403 (not 401): a 401 makes the browser renew its session and retry
					return next(new HttpException(req, res, 403, `You must be ${needed}.`));
				}
				req.groupRole = role;
			} catch (error) {
				return next(error);
			}
			req.user = user;
			return next();
		})(req, res, next);
	};

// Any member of the group (reading: the viewer, its panels, the histories)
export const groupViewerAuth = groupRoleAuth("Viewer");
// Editor or Admin: changing what is built (pipelines, sensors, topics, assets, digital twins, layouts)
export const groupEditorAuth = groupRoleAuth("Editor");
