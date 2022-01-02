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
	updateOrgUserRoleInDefaultOrgGroup,
	organizationsWhichTheLoggedUserIsUser,
	getOrganizationsWithIdsArray
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
	isUsersDataCorrect,
	getOrganizationUsersWithGrafanaAdmin,
	getOrganizationUsersForOrgIdsArray,
	getOrganizationUserWithGrafanaAdminByProp
} from "../user/userDAL";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import IRequestWithOrganizationAndUser from "./interfaces/requestWithOrganizationAndUser.interface";
import HttpException from "../../exceptions/HttpException";
import CreateUsersArrayDto from "../user/interfaces/UsersArray.dto";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import UserInOrgToUpdateDto from "../user/interfaces/UserInOrgToUpdate.dto";
import { createGroup, defaultOrgGroupName, deleteGroup, getAllGroupsInOrganization, getDefaultOrgGroup, getGroupMemberByProp, getGroupMembers, getGroupsManagedByUserId, getGroupsOfOrgIdWhereUserIdIsMember, getOrgsIdArrayForGroupsManagedByUserId, removeMembersInGroup, removeMembersInGroupsArray } from "../group/groupDAL";
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
import IGroupMember from "../group/interfaces/GroupMember.interface";
import IUser from "../user/interfaces/User.interface";
import { createTopic, demoTopicName } from "../topic/topicDAL";
import { createDigitalTwin, demoDigitalTwinName } from "../digitalTwin/digitalTwinDAL";
import { existsBuildingWithId } from "../building/buildingDAL";
import process_env from "../../config/api_config";


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
			.get(
				`${this.path}s/user_groups_managed/`,
				userAuth,
				this.getOrganizationsOfGroupsManagedByUser
			)
			.get(
				`/organization_users/user_orgs_managed/`,
				userAuth,
				this.getOrganizationsUsersForOrgsManagedByUser
			)
			.get(
				`/organization_users/user_groups_managed/`,
				userAuth,
				this.getOrganizationsUsersForOrgsWithGroupsManagedByUser
			)
			.get(
				`${this.path}s/which_the_logged_user_is_user/`,
				userAuth,
				this.getOrganizationsWhichTheLoggedUserIsUser
			);

		this.router
			.post(
				`${this.path}/:orgId/user/`,
				organizationExists,
				organizationAdminAuth,
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
				organizationExists,
				organizationAdminAuth,
				this.removeUserFromOrganization
			)
			.delete(
				`${this.path}/:orgId/users/:whoToRemove`,
				organizationExists,
				organizationAdminAuth,
				this.removeOrganizationUsers
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

	private organizationsManagedByUser = async (user: IUser): Promise<IOrganization[]> => {
		let organizations: IOrganization[];
		if (user.isGrafanaAdmin) {
			organizations = await getOrganizations();
		} else {
			organizations = await getOrganizationsManagedByUserId(user.id);
		}
		return organizations;
	}

	private getOrganizationsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await this.organizationsManagedByUser(req.user);
			res.status(200).send(organizations);
		} catch (error) {
			next(error);
		}
	};


	private organizationsOfGroupsManagedByUser = async (user: IUser): Promise<IOrganization[]> => {
		let organizations: IOrganization[];
		if (user.isGrafanaAdmin) {
			organizations = await getOrganizations();
		} else {
			organizations = await getOrganizationsManagedByUserId(user.id);
			const orgsManagedIdArray = organizations.map(org => org.id);
			const groups = await getGroupsManagedByUserId(user.id);
			if (groups.length !== 0) {
				const orgIdsArray = groups.map(group => group.orgId);
				const orgsOfGroupsManaged = await getOrganizationsWithIdsArray(orgIdsArray)
				orgsOfGroupsManaged.forEach(org => {
					if (orgsManagedIdArray.indexOf(org.id) === -1) organizations.push(org);
				})
			}
		}
		return organizations;
	}

	private getOrganizationsOfGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await this.organizationsOfGroupsManagedByUser(req.user);
			res.status(200).send(organizations);
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationsUsersForOrgsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await this.organizationsManagedByUser(req.user);
			const orgIdsArray = organizations.map(org => org.id);
			const orgUsers = await getOrganizationUsersForOrgIdsArray(orgIdsArray);
			orgUsers.forEach(user => {
				user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
			});
			res.status(200).send(orgUsers);
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationsUsersForOrgsWithGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await this.organizationsManagedByUser(req.user);
			const orgIdsArrayForOrgsAdmin = organizations.map(org => org.id);
			const orgsArrayForGroupsManagedByUser = await getOrgsIdArrayForGroupsManagedByUserId(req.user.id);
			const orgsIdArrayForGroupsManagedByUser = orgsArrayForGroupsManagedByUser.map(item => item.orgId);
			const orgIdsArray = [...new Set([...orgIdsArrayForOrgsAdmin, ...orgsIdArrayForGroupsManagedByUser])];
			const orgUsers = await getOrganizationUsersForOrgIdsArray(orgIdsArray);
			orgUsers.forEach(user => {
				user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
			});
			res.status(200).send(orgUsers);
		} catch (error) {
			next(error);
		}
	};

	private getOrganizationsWhichTheLoggedUserIsUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const organizations = await organizationsWhichTheLoggedUserIsUser(req.user.id);
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
				if (!(await existsBuildingWithId(organizationData.buildingId))) {
					throw new HttpException(400, "There is no building with the indicated buildingId")
				}
				const newOrg = await this.grafanaRepository.createOrganization(orgGrafanaDTO);
				await grafanaApi.createOrgApiAdminUser(newOrg.orgId);
				await updateOrganizationByProp("id", newOrg.orgId, organizationData);
				const apyKeyName = `ApiKey_${organizationData.acronym.replace(/"/g,"")}`
				const apiKeyData = { name: apyKeyName, role: "Admin" };
				await grafanaApi.switchOrgContextForAdmin(newOrg.orgId);
				const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
				const hashedApiKey = encrypt(apiKeyObj.key);
				const apiKeyId = await getApiKeyIdByName(apyKeyName);
				await insertOrganizationToken(newOrg.orgId, apiKeyId, hashedApiKey);
				await grafanaApi.changeUserRoleInOrganization(newOrg.orgId, 1, "Admin"); // Giving org. admin permissions to Grafana Admin
				const dataSourceName = `iot_${organizationData.acronym.replace(/ /g, "_").replace(/"/g,"").toLowerCase()}_db`;
				await createDefaultOrgDataSource(newOrg.orgId, dataSourceName, apiKeyObj.key);
				const groupAdminDataArray: CreateGroupAdminDto[] = [];
				const platformAdminEmail = process_env.PLATFORM_ADMIN_EMAIL;
				const orgAdminArrayFiltered = organizationData.orgAdminArray.filter(orgAdmin => orgAdmin.email === platformAdminEmail);
				if (orgAdminArrayFiltered.length === 0) {
					organizationData.orgAdminArray.push({
						name: `${process_env.PLATFORM_ADMIN_FIRST_NAME} ${process_env.PLATFORM_ADMIN_SURNAME}`,
						firstName: process_env.PLATFORM_ADMIN_FIRST_NAME,
						surname: process_env.PLATFORM_ADMIN_SURNAME,
						email: process_env.PLATFORM_ADMIN_EMAIL,
						login: process_env.PLATFORM_ADMIN_USER_NAME,
						password: process_env.PLATFORM_ADMIN_PASSWORD,
					});
				}
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
				const defaultOrgGroupAcronym = `${organizationData.acronym.replace(/ /g, "_").replace(/"/g,"").toUpperCase()}_GRAL`;
				const defaultOrgGroup = {
					name: groupName,
					acronym: defaultOrgGroupAcronym,
					email: `${organizationData.acronym.replace(/ /g, "_").replace(/"/g,"").toLocaleLowerCase()}_general@test.com`,
					telegramChatId: organizationData.telegramChatId,
					telegramInvitationLink: organizationData.telegramInvitationLink,
					folderPermission: ("Viewer" as FolderPermissionOption),
					groupAdminDataArray,
					floorNumber: 0,
					featureIndex: 0
				}
				const adminIdArray = await addAdminToOrganization(newOrg.orgId, organizationData.orgAdminArray);
				defaultOrgGroup.groupAdminDataArray.forEach((admin, index) => admin.userId = adminIdArray[index]);
				const group = await createGroup(newOrg.orgId, defaultOrgGroup, organizationData.name, true);
				await addOrgUsersToDefaultOrgGroup(newOrg.orgId, organizationData.orgAdminArray);
				await createHomeDashboard(newOrg.orgId, organizationData.acronym, organizationData.name, group.folderId);
				const defaultGroupDeviceData = [
					{
						name: defaultGroupDeviceName(group, "Generic"),
						description: `Default generic device of the group ${defaultOrgGroupAcronym}`,
						latitude: 0,
						longitude: 0,
						type: "Generic"
					},
					{
						name: defaultGroupDeviceName(group, "Mobile"),
						description: `Default mobile device of the group ${defaultOrgGroupAcronym}`,
						latitude: 0,
						longitude: 0,
						type: "Mobile"
					}
				];
				const device1 = await createDevice(group, defaultGroupDeviceData[0]);
				const device2 = await createDevice(group, defaultGroupDeviceData[1]);

				const defaultDeviceTopicsData = [
					{
						topicType: "dev2pdb",
						topicName: demoTopicName(group, device1, "Temperature"),
						description: `Temperature sensor for default generic device of the group ${group.acronym}`,
						payloadFormat: '{"temp": {"type": "number", "unit":"°C"}}'
					},
					{	topicType: "dev2pdb",
						topicName: demoTopicName(group, device2, "Accelerometer"),
						description: `Accelerometer for default mobile device of the group ${group.acronym}`,
						payloadFormat: '{"accelerations": {"type": "array", "items": { "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}}}'
					},
				];
				const topic1 = await createTopic(device1.id, defaultDeviceTopicsData[0]);
				const topic2 = await createTopic(device2.id, defaultDeviceTopicsData[1]);

				const dashboardsId: number[] = [];

				[dashboardsId[0], dashboardsId[1]] =
					await createDemoDashboards(organizationData.acronym, group, [device1, device2], [topic1, topic2]);

				const defaultDeviceDigitalTwinsData = [
					{
						name: demoDigitalTwinName(group, "Generic"),
						description: `Demo digital twin for default generic device of the group ${group.acronym}`,
						type: "Grafana dashboard",
						dashboardId: dashboardsId[0],
						gltfData: "{}",
						gltfFileName: "-",
						gltfFileLastModifDateString: "-",
						femSimulationData: "{}",
						femSimDataFileName: "-",
						femSimDataFileLastModifDateString: "-"
					},
					{
						name: demoDigitalTwinName(group, "Mobile"),
						description: `Demo digital twin for default mobile device of the group ${group.acronym}`,
						type: "Grafana dashboard",
						dashboardId: dashboardsId[1],
						gltfData: "{}",
						gltfFileName: "-",
						gltfFileLastModifDateString: "-",
						femSimulationData: "{}",
						femSimDataFileName: "-",
						femSimDataFileLastModifDateString: "-"
					},
				];

				await createDigitalTwin(device1.id, defaultDeviceDigitalTwinsData[0]);
				await createDigitalTwin(device2.id, defaultDeviceDigitalTwinsData[1]);
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
				throw new HttpException(400, "The same values of name, login, email and / or telegramId of some of the users is already taken.")
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
			const nonExistingUserArray = orgUsersData.filter(user => emailsArray.indexOf(user.email) === -1);

			let numUsersCreated = 0;
			let numUsersAddedToOrg = 0;
			const orgId = organization.id;
			if (nonExistingUserArray.length !== 0) {
				if (!(await isUsersDataCorrect(nonExistingUserArray)))
					throw new HttpException(400, "The same values of name, login, email and / or telegramId of some of the users is already taken.")
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
			const message = `${numUsersAddedToOrg} users added to org and ${numUsersCreated} new users created`;
			res.status(200).send({ message });
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
			if (user.isGrafanaAdmin) {
				throw new HttpException(403, "A platform administrator user cannot be removed from an org.")
			}
			if (user.login.slice(-9) === "api_admin") {
				throw new HttpException(403, "An api admin user can not be removed from the org.")
			}
			const groupsArray = await getGroupsOfOrgIdWhereUserIdIsMember(organization.id, user.userId);
			if (groupsArray.length !== 0) {
				const groupMember = await getGroupMemberByProp(groupsArray[0], "id", user.userId);
				await removeMembersInGroupsArray(groupsArray, [groupMember]);
			}
			const msg = await grafanaApi.removeUserFromOrganization(organization.id, user.userId);
			const message = { message: `User removed from the organization` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private removeOrganizationUsers = async (
		req: IRequestWithOrganizationAndUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { whoToRemove } = req.params;
			if (!this.isValidWhoToRemove(whoToRemove)) throw new InvalidPropNameExeception(whoToRemove);
			const { organization } = req;
			if (!req.user.isGrafanaAdmin && whoToRemove === "allUsers") {
				throw new HttpException(401, "To remove organization admin users, platform administrator privileges are needed.");
			}
			const usersArray = await getOrganizationUsersWithGrafanaAdmin(organization.id);
			const groupsArray = await getAllGroupsInOrganization(organization.id);
			if (groupsArray.length !== 0) {
				for (const group of groupsArray) {
					const groupMembers = await getGroupMembers(group);
					let groupMembersToRemove: IGroupMember[] = [];
					if (whoToRemove === "allUsers" || whoToRemove === "allNotOrgAdminUsers") {
						groupMembersToRemove = [...groupMembers]
					} else {
						groupMembers.filter(member => member.roleInGroup !== "Admin");
					}
					await removeMembersInGroup(group, groupMembersToRemove);
				}
			}

			let usersIdArray: number[];
			if (whoToRemove === "allUsers") {
				usersIdArray = usersArray.filter(user => !user.isGrafanaAdmin).map(user => user.userId);
			} else {
				usersIdArray = usersArray.filter(user => user.roleInOrg !== "Admin").map(user => user.userId);
			}
			const msgArray = await grafanaApi.removeUsersFromOrganization(organization.id, usersIdArray);
			const message = { message: `Users removed from the organization` }
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
			const existUserInOrg = await getOrganizationUserWithGrafanaAdminByProp(organization.id, propName, propValue);
			if (!existUserInOrg) throw new ItemNotFoundException("The user", propName, propValue);
			const userInOrgData: UserInOrgToUpdateDto = req.body;
			if (userInOrgData.roleInOrg) {
				if (!req.user.isGrafanaAdmin && userInOrgData.roleInOrg === "Admin") {
					throw new HttpException(401, "To assign organization admin role to a user, platform administrator privileges are needed.");
				}
				if (!req.user.isGrafanaAdmin && existUserInOrg.isGrafanaAdmin) {
					throw new HttpException(401, "The role in the org of the platform administrator only can be modify by himself.");
				}
				if (userInOrgData.roleInOrg !== existUserInOrg.roleInOrg) {
					await grafanaApi.changeUserRoleInOrganization(organization.id, existUserInOrg.userId, userInOrgData.roleInOrg);
					await updateOrgUserRoleInDefaultOrgGroup(organization.id, existUserInOrg, userInOrgData.roleInOrg);
				}
			}
			const message = { message: `User role in org updated succesfully.` }
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
			if (user.lastSeenAtAge) user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
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
				user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
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
			await grafanaApi.deleteOrgApiAdminUser(organization.id);
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

	private isValidWhoToRemove = (whoToRemove: string) => {
		const validWhoToRemove = ["allUsers", "allNotOrgAdminUsers", "allNotGroupsAdminUsers"];
		return validWhoToRemove.indexOf(whoToRemove) !== -1;
	}
}

export default OrganizationController;