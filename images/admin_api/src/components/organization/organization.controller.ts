import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateOrganizationDto from "./interfaces/organization.dto";
import IRequestWithOrganization from "./interfaces/requestWithOrganization.interface";
import { organizationAdminAuth, superAdminAuth, userAuth } from "../../middleware/auth.middleware";
import IOrganizationGrafanaDTO from "../../GrafanaApi/interfaces/IOrganizationGrafanaDTO";
import grafanaApi from "../../GrafanaApi";
import AlreadyExistingItemException from "../../exceptions/AlreadyExistingItemException";
import {
	updateOrganizationById,
	getApiKeyIdByName,
	insertOrganizationToken,
	exitsOrganizationWithName,
	exitsOrganizationWithAcronym,
	getOrganizations,
	getOrganizationByProp,
	updateOrganizationByProp,
	createDefaultOrgDataSource,
	getOrganizationKey,
	addAdminToOrganization,
	addOrgUsersToDefaultOrgGroup,
	addUsersToOrganizationAndMembersToDefaultOrgGroup,
	getOrganizationsManagedByUserId,
	updateOrgUserRoleInDefaultOrgGroup
} from "./organizationDAL";
import { encrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import CreateUserDto from "../user/interfaces/User.dto";
import {
	getUserLoginDatadByEmailOrLogin,
	getOrganizationUsers,
	createOrganizationUsers,
	getOrganizationUserByProp,
	updateOrganizationUser,
	getUsersIdByEmailsArray,
	isUsersDataCorrect
} from "../user/userDAL";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import IRequestWithOrganizationAndUser from "./interfaces/requestWithOrganizationAndUser.interface";
import HttpException from "../../exceptions/HttpException";
import CreateUsersArrayDto from "../user/usersArray.dto";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import UserInOrgToUpdateDto from "../user/interfaces/UserInOrgToUpdate.dto";
import { createGroup, defaultOrgGroupName, deleteGroup, getDefaultOrgGroup } from "../group/groupDAL";
import IMessage from "../../GrafanaApi/interfaces/Message";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import { FolderPermissionOption } from "../group/interfaces/FolerPermissionsOptions";
import CreateGroupAdminDto from "../group/interfaces/groupAdmin.dto";
import { RoleInGroupOption } from "../group/interfaces/RoleInGroupOptions";
import { createDemoDashboards, createHomeDashboard } from "../group/dashboardDAL";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IOrganization from "./interfaces/organization.interface";
import { createDevice, defaultGroupDeviceName } from "../device/deviceDAL";
import UpdateOrganizationDto from "./interfaces/updateOrganization.dto";

class OrganizationController implements IController {
	public path = "/organization";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getOrganizationsManagedByUser
			)

		this.router
			.post(
				`${this.path}/:orgId/user/`,
				superAdminAuth,
				organizationExists,
				validationMiddleware<CreateUserDto>(CreateUserDto),
				this.addUserToOrganization
			)
			.post(
				`${this.path}/:orgId/users/`,
				organizationExists,
				organizationAdminAuth,
				validationMiddleware<CreateUsersArrayDto>(CreateUsersArrayDto),
				this.addUsersToOrganization
			)
			.get(
				`${this.path}/:orgId/user/:propName/:propValue`,
				organizationExists,
				organizationAdminAuth,
				this.getUserInOrganizationByProp
			)
			.patch(
				`${this.path}/:orgId/user/:propName/:propValue`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<UserInOrgToUpdateDto>(UserInOrgToUpdateDto, true),
				this.updateUserInOrganizationByProp
			)
			.delete(
				`${this.path}/:orgId/user/:propName/:propValue`,
				superAdminAuth,
				organizationExists,
				this.removeUserFromOrganization
			);

		this.router
			.get(
				`${this.path}/:orgId/users/`,
				organizationExists,
				organizationAdminAuth,
				this.getOrganizationUsers
			);

		this.router.get(`${this.path}s`, superAdminAuth, this.getAllOrganization);

		this.router
			.get(
				`${this.path}/:propName/:propValue`,
				superAdminAuth,
				this.getOrganizationByProp
			)
			.patch(
				`${this.path}/:propName/:propValue`,
				superAdminAuth,
				validationMiddleware<UpdateOrganizationDto>(UpdateOrganizationDto, true),
				this.modifyOrganizationByProp
			)
			.delete(`${this.path}/:propName/:propValue`, superAdminAuth, this.deleteOrganizationByProp)
			.post(
				this.path,
				superAdminAuth,
				validationMiddleware<CreateOrganizationDto>(CreateOrganizationDto),
				this.createOrganization
			);

	}

	private getOrganizationsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			let organizations: IOrganization[];
			if (req.user.isGrafanaAdmin) {
				organizations = await getOrganizations();
			} else {
				organizations = await getOrganizationsManagedByUserId(req.user.id);
			}
			res.status(200).send(organizations);
		} catch (error) {
			next(error);
		}
	};

	private createOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizationData: CreateOrganizationDto = req.body;
			organizationData.acronym = organizationData.acronym.replace(/ /g, "_").toUpperCase();
			const orgGrafanaDTO: IOrganizationGrafanaDTO = { name: organizationData.name };
			const exits_OrganizationWithName = await exitsOrganizationWithName(organizationData.name);
			const exits_OrganizationWithAcronym = await exitsOrganizationWithAcronym(organizationData.acronym);
			if (exits_OrganizationWithName || exits_OrganizationWithAcronym) {
				if (exits_OrganizationWithName) throw new AlreadyExistingItemException("An", "Organization", ["name"], [organizationData.name]);
				if (exits_OrganizationWithAcronym) throw new AlreadyExistingItemException("An", "Organization", ["acronym"], [organizationData.acronym]);
			} else {
				if (!(await isUsersDataCorrect(organizationData.orgAdminArray)))
					throw new HttpException(400, "The same values of name, login, email and/or telegramId of some user already exists.")
				const newOrg = await this.grafanaRepository.createOrganization(orgGrafanaDTO);
				await updateOrganizationById(newOrg.orgId, organizationData);
				const apyKeyName = `ApiKey_${organizationData.acronym}`
				const apiKeyData = { name: apyKeyName, role: "Admin" };
				await grafanaApi.switchOrgContextForAdmin(newOrg.orgId);
				const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
				const hashedApiKey = encrypt(apiKeyObj.key);
				const apiKeyId = await getApiKeyIdByName(apyKeyName);
				await insertOrganizationToken(newOrg.orgId, apiKeyId, hashedApiKey);
				await grafanaApi.changeUserRoleInOrganization(newOrg.orgId, 1, "Admin"); // Giving org. admin permissions to Grafana Admin
				const dataSourceName = `iot_${organizationData.acronym.replace(/ /g, "_").toLowerCase()}_db`;
				await createDefaultOrgDataSource(newOrg.orgId, dataSourceName, apiKeyObj.key);
				const groupAdminDataArray: CreateGroupAdminDto[] = []
				organizationData.orgAdminArray.forEach(user => {
					groupAdminDataArray.push(
						{
							firstName: user.firstName,
							surname: user.surname,
							email: user.email,
							roleInGroup: ("Admin" as RoleInGroupOption)
						})
				});
				const groupName = defaultOrgGroupName(organizationData.name, organizationData.acronym);
				const defaultOrgGroupAcronym = `${organizationData.acronym.replace(/ /g, "_").toUpperCase()}_GRAL`;
				const defaultOrgGroup = {
					name: groupName,
					acronym: defaultOrgGroupAcronym,
					email: `${organizationData.acronym.replace(/ /g, "_").toLocaleLowerCase()}_general@test.com`,
					telegramChatId: organizationData.telegramChatId,
					telegramInvitationLink: organizationData.telegramInvitationLink,
					folderPermission: ("Viewer" as FolderPermissionOption),
					groupAdminDataArray
				}
				const adminIdArray = await addAdminToOrganization(newOrg.orgId, organizationData.orgAdminArray);
				defaultOrgGroup.groupAdminDataArray.forEach((admin, index) => admin.userId = adminIdArray[index]);
				const group = await createGroup(newOrg.orgId, defaultOrgGroup, organizationData.name, true);
				await addOrgUsersToDefaultOrgGroup(newOrg.orgId, organizationData.orgAdminArray);
				await createHomeDashboard(newOrg.orgId, organizationData.acronym, organizationData.name, group.folderId);
				const defaultGroupDeviceData = {
					name: defaultGroupDeviceName(group),
					description: `Default device of the group ${groupName}`,
					latitude: organizationData.longitude,
					longitude: organizationData.longitude
				};
				const device = await createDevice(group, defaultGroupDeviceData, true);
				await createDemoDashboards(organizationData.acronym, group, device);
			}
			const message = { message: "Organization created successfully" }
			res.status(201).send(message);
		} catch (error) {
			next(error);
		}
	};

	private addUserToOrganization = async (
		req: IRequestWithOrganizationAndUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const orgUserData: CreateUserDto = req.body;
			orgUserData.OrgId = organization.id;
			const existUser = await getUserLoginDatadByEmailOrLogin(orgUserData.email);
			if (!existUser && !(await isUsersDataCorrect([orgUserData])))
				throw new HttpException(400, "The same values of name, login, email and/or telegramId of any user already exists.")
			let user_msg: IMessage;
			if (!orgUserData.roleInOrg) orgUserData.roleInOrg = "Viewer";
			else {
				if (!req.user.isGrafanaAdmin && orgUserData.roleInOrg === "Admin") {
					throw new HttpException(401, "To assign organization admin role to a user, platform administrator privileges are needed.");
				}
			}
			const orgId = organization.id;
			if (existUser) {
				orgUserData.id = existUser.id;
				const msg_users = await addUsersToOrganizationAndMembersToDefaultOrgGroup(orgId, [orgUserData]);
				user_msg = msg_users[0];
			} else {
				const msg_users = await createOrganizationUsers(organization.id, [orgUserData]);
				orgUserData.id = msg_users[0].id;
				await addOrgUsersToDefaultOrgGroup(orgId, [orgUserData]);
				user_msg = msg_users[0];
			}
			const message = { message: user_msg.message };
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private addUsersToOrganization = async (
		req: IRequestWithOrganizationAndUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const orgUsersData: CreateUserDto[] = req.body.users;
			orgUsersData.forEach((user: CreateUserDto) => {
				user.OrgId = organization.id
				if (!user.roleInOrg) user.roleInOrg = "Viewer";
				else {
					if (!req.user.isGrafanaAdmin && user.roleInOrg === "Admin") {
						throw new HttpException(401, "To assign organization admin role to a user, platform administrator privileges are needed.");
					}
				}
			});

			const usersIdArray = await getUsersIdByEmailsArray(orgUsersData.map(user => user.email));
			const emailsArray = usersIdArray.map(user => user.email);
			const existingUserArray: CreateUserDto[] = [];
			orgUsersData.forEach(orgUser => {
				const orgIndex = emailsArray.indexOf(orgUser.email);
				if (orgIndex !== -1) {
					orgUser.id = usersIdArray[orgIndex].id;
					existingUserArray.push(orgUser);
				}
			})
			orgUsersData.filter(user => emailsArray.indexOf(user.email) !== -1);
			const nonExistingUserArray = orgUsersData.filter(user => emailsArray.indexOf(user.email) === -1);

			let numUsersCreated = 0;
			let numUsersAddedToOrg = 0;
			const orgId = organization.id;
			if (nonExistingUserArray.length !== 0) {
				if (!(await isUsersDataCorrect(nonExistingUserArray)))
					throw new HttpException(400, "The same values of name, login, email and/or telegramId of any user already exists.")
				const msg_users = await createOrganizationUsers(orgId, nonExistingUserArray);
				msg_users.forEach((msg, index) => nonExistingUserArray[index].id = msg.id);
				await addOrgUsersToDefaultOrgGroup(organization.id, nonExistingUserArray);
				numUsersCreated = msg_users.filter(msg => msg.message === "User created").length;
				numUsersAddedToOrg = numUsersCreated;
			}

			if (existingUserArray.length !== 0) {
				const msg_users = await addUsersToOrganizationAndMembersToDefaultOrgGroup(orgId, existingUserArray);
				numUsersAddedToOrg += msg_users.filter(msg => msg.message === "User added to organization").length;
			}
			const message = { numUsersCreated, numUsersAddedToOrg };
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private removeUserFromOrganization = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const user = await getOrganizationUserByProp(organization.id, propName, propValue);
			if (!user) throw new ItemNotFoundException("The user", propName, propValue);
			const msg = await grafanaApi.removeUserFromOrganization(organization.id, user.userId);
			const message = { message: `User removed from the organization` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateUserInOrganizationByProp = async (
		req: IRequestWithOrganizationAndUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const existUserInOrg = await getOrganizationUserByProp(organization.id, propName, propValue);
			if (!existUserInOrg) throw new ItemNotFoundException("The user", propName, propValue);
			const userInOrgData: UserInOrgToUpdateDto = req.body;
			if (userInOrgData.roleInOrg) {
				if (!req.user.isGrafanaAdmin && userInOrgData.roleInOrg === "Admin") {
					throw new HttpException(401, "To assign organization admin role to a user, platform administrator privileges are needed.");
				}
				if (userInOrgData.roleInOrg !== existUserInOrg.roleInOrg) {
					await grafanaApi.changeUserRoleInOrganization(organization.id, existUserInOrg.userId, userInOrgData.roleInOrg);
					await updateOrgUserRoleInDefaultOrgGroup(organization.id, existUserInOrg, userInOrgData.roleInOrg);
				}
			}
			const userInOrgDataUpdated = { ...existUserInOrg, ...userInOrgData };
			await updateOrganizationUser(userInOrgDataUpdated);
			const message = { message: `User updated succesfully.` }
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getUserInOrganizationByProp = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const user = await getOrganizationUserByProp(organization.id, propName, propValue);
			if (!user) throw new ItemNotFoundException("The user", propName, propValue);
			if (user.lastSeenAtAge) user.lastSeenAtAge = generateLastSeenAtAgeString(user);
			res.status(200).json(user);
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationUsers = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { organization } = req;
			const users = await getOrganizationUsers(organization.id);
			users.forEach(user => {
				user.lastSeenAtAge = generateLastSeenAtAgeString(user);
			});
			res.status(200).json(users);
		} catch (error) {
			next(error);
		}
	};

	private getAllOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await getOrganizations();
			res.status(200).send(organizations);
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(propName);
			const organization = await getOrganizationByProp(propName, propValue);
			if (!organization) throw new ItemNotFoundException("The organization", propName, propValue);
			res.status(200).send(organization);
		} catch (error) {
			next(error);
		}
	};

	private modifyOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(propName);
			const orgDataToUpdate: UpdateOrganizationDto = req.body;
			const oldOrganizationData = await getOrganizationByProp(propName, propValue);
			if (!oldOrganizationData) throw new ItemNotFoundException("The organization", propName, propValue);
			const newOrganizationData = { ...oldOrganizationData, ...orgDataToUpdate };
			await updateOrganizationByProp(propName, propValue, newOrganizationData);
			res.status(200).json({ message: `Organization updated successfully` });
		} catch (error) {
			next(error);
		}
	};

	private deleteOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(propName);
			const organization = await getOrganizationByProp(propName, propValue);
			if (!organization) throw new ItemNotFoundException("The Organization", propName, propValue);
			if (organization.id === 1) throw new HttpException(400, "Main organization can not be deleted");
			const defaultOrgGroup = await getDefaultOrgGroup(organization.id);
			const orgKey = await getOrganizationKey(organization.id);
			await deleteGroup(defaultOrgGroup, orgKey);
			await grafanaApi.deleteOrganizationById(organization.id);
			await grafanaApi.switchOrgContextForAdmin(1);
			res.status(200).json({ message: `Organization deleted successfully` });
		} catch (error) {
			next(error);
		}
	};

	private isValidOrganizationPropName = (propName: string) => {
		const validPropName = ["id", "name", "acronym"];
		return validPropName.indexOf(propName) !== -1;
	}

	private isValidUserPropName = (propName: string) => {
		const validPropName = ["id", "login", "email"];
		return validPropName.indexOf(propName) !== -1;
	}
}

export default OrganizationController;