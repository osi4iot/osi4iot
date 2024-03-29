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
	addAdminToOrganization,
	addOrgUsersToDefaultOrgGroup,
	addUsersToOrganizationAndMembersToDefaultOrgGroup,
	getOrganizationsManagedByUserId,
	updateOrgUserRoleInDefaultOrgGroup,
	organizationsWhichTheLoggedUserIsUser,
	getOrganizationsWithIdsArray,
	updateNodeRedInstancesInOrg,
} from "./organizationDAL";
import { encrypt } from "../../utils/encryptAndDecrypt/encryptAndDecrypt";
import CreateUserDto from "../user/interfaces/User.dto";
import {
	getUserLoginDatadByEmailOrLogin,
	getOrganizationUsers,
	createOrganizationUsers,
	getOrganizationUserByProp,
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
import {
	createGroup,
	defaultOrgGroupName,
	getAllGroupsInOrganization,
	getGroupMemberByProp,
	getGroupMembers,
	getGroupsManagedByUserId,
	getGroupsOfOrgIdWhereUserIdIsMember,
	getOrgsIdArrayForGroupsManagedByUserId,
	removeMembersInGroup,
	removeMembersInGroupsArray
} from "../group/groupDAL";
import IMessage from "../../GrafanaApi/interfaces/Message";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import { FolderPermissionOption } from "../group/interfaces/FolerPermissionsOptions";
import CreateGroupAdminDto from "../group/interfaces/groupAdmin.dto";
import { RoleInGroupOption } from "../group/interfaces/RoleInGroupOptions";
import { createHomeDashboard, createSensorDashboard } from "../group/dashboardDAL";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IOrganization from "./interfaces/organization.interface";
import UpdateOrganizationDto from "./interfaces/updateOrganization.dto";
import IGroupMember from "../group/interfaces/GroupMember.interface";
import IUser from "../user/interfaces/User.interface";
import { createTopic } from "../topic/topicDAL";
import {
	createDigitalTwin,
	generateDashboardsUrl,
	removeFilesFromBucketFolder,
	uploadMobilePhoneGltfFile
} from "../digitalTwin/digitalTwinDAL";
import { existsBuildingWithId } from "../building/buildingDAL";
import process_env from "../../config/api_config";
import {
	assignNodeRedInstanceToGroup,
	createNodeRedInstancesInOrg,
	getNodeRedInstancesByOrgsIdArray
} from "../nodeRedInstance/nodeRedInstanceDAL";
import { createTimescaledbOrgDataSource } from "../group/datasourceDAL";
import { createNewAsset, createNewAssetType } from "../asset/assetDAL";
import { createNewSensor } from "../sensor/sensorDAL";
import CreateSensorDto from "../sensor/sensor.dto";
import { nanoid } from "nanoid";
import { getDashboardsInfoFromIdArray } from "../dashboard/dashboardDAL";
import ISensor from "../sensor/sensor.interface";
import ITopic from "../topic/topic.interface";
import infoLogger from "../../utils/logger/infoLogger";
import CreateSensorRefDto from "../digitalTwin/createSensorRef.dto";
import { predefinedAssetTypes } from "../../initialization/predefinedAssetTypes";
import IAssetType from "../asset/assetType.interface";

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
			let orgsManagedIdArray: number[] = [];
			organizations = await getOrganizationsManagedByUserId(user.id);
			if (organizations.length !== 0) {
				orgsManagedIdArray = organizations.map(org => org.id);
			}
			const groups = await getGroupsManagedByUserId(user.id);
			if (groups.length !== 0) {
				const orgIdsArray = groups.map(group => group.orgId);
				const orgsOfGroupsManaged = await getOrganizationsWithIdsArray(orgIdsArray)
				orgsOfGroupsManaged.forEach(org => {
					if (orgsManagedIdArray.indexOf(org.id) === -1) {
						organizations.push(org);
					}
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
				if (exits_OrganizationWithName) throw new AlreadyExistingItemException(
					req, res, "An", "Organization", ["name"], [organizationData.name]
				);
				if (exits_OrganizationWithAcronym) throw new AlreadyExistingItemException(
					req, res, "An", "Organization", ["acronym"], [organizationData.acronym]
				);
			} else {
				if (!(await isUsersDataCorrect(organizationData.orgAdminArray)))
					throw new HttpException(
						req,
						res,
						400,
						"The same values of name, login and email of some user already exists."
					)
				if (!(await existsBuildingWithId(organizationData.buildingId))) {
					throw new HttpException(
						req,
						res,
						400,
						"There is no building with the indicated buildingId"
					)
				}
				const newOrg = await this.grafanaRepository.createOrganization(orgGrafanaDTO);
				await grafanaApi.createOrgApiAdminUser(newOrg.orgId);
				await updateOrganizationByProp("id", newOrg.orgId, organizationData);
				const apyKeyName = `ApiKey_${organizationData.acronym.replace(/"/g, "")}`
				const apiKeyData = { name: apyKeyName, role: "Admin" };
				await grafanaApi.switchOrgContextForAdmin(newOrg.orgId);
				const apiKeyObj = await grafanaApi.createApiKeyToken(apiKeyData);
				const hashedApiKey = encrypt(apiKeyObj.key);
				const apiKeyId = await getApiKeyIdByName(apyKeyName);
				await insertOrganizationToken(newOrg.orgId, apiKeyId, hashedApiKey);
				await grafanaApi.changeUserRoleInOrganization(newOrg.orgId, 1, "Admin"); // Giving org. admin permissions to Grafana Admin
				await createTimescaledbOrgDataSource(newOrg.orgId, apiKeyObj.key);
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
				const defaultOrgGroupAcronym = `${organizationData.acronym.replace(/ /g, "_").replace(/"/g, "").toUpperCase()}_GRAL`;
				const defaultOrgGroup = {
					name: groupName,
					acronym: defaultOrgGroupAcronym,
					email: `${organizationData.acronym.replace(/ /g, "_").replace(/"/g, "").toLocaleLowerCase()}_general@test.com`,
					telegramChatId: organizationData.telegramChatId,
					telegramInvitationLink: organizationData.telegramInvitationLink,
					folderPermission: ("Viewer" as FolderPermissionOption),
					groupAdminDataArray,
					floorNumber: 0,
					featureIndex: 1,
					mqttAccessControl: "Pub & Sub"
				}
				const adminIdArray = await addAdminToOrganization(newOrg.orgId, organizationData.orgAdminArray);
				defaultOrgGroup.groupAdminDataArray.forEach((admin, index) => admin.userId = adminIdArray[index]);
				const group = await createGroup(newOrg.orgId, defaultOrgGroup, organizationData.name, true);
				await addOrgUsersToDefaultOrgGroup(newOrg.orgId, organizationData.orgAdminArray);
				await createHomeDashboard(
					newOrg.orgId,
					organizationData.acronym,
					organizationData.name,
					group.folderId
				);

				const noredInstances = await createNodeRedInstancesInOrg(organizationData.nriHashes, newOrg.orgId);
				await assignNodeRedInstanceToGroup(noredInstances[0], group.id);

				const assetTypes: IAssetType[] = [];
				for (const assetType of predefinedAssetTypes as IAssetType[]) {
					const defaultAssetTypeData = {
						orgId: newOrg.orgId,
						type: assetType.type,
						iconSvgFileName: assetType.iconSvgFileName,
						iconSvgString: assetType.iconSvgString,
						geolocationMode: assetType.geolocationMode,
						markerSvgFileName: assetType.markerSvgFileName,
						markerSvgString: assetType.markerSvgString,
						assetStateFormat: "{}",
						isPredefined: true,
					}
					const newAssetType = await createNewAssetType(defaultAssetTypeData);
					assetTypes.push(newAssetType);
				}

				const defaultAssetData = {
					description: `Mobile for group ${group.acronym}`,
					assetTypeId: assetTypes[4].id,
					iconRadio: 1.0,
					iconSizeFactor: 1.0,
					longitude: 0.0,
					latitude: 0.0,
				}
				const asset = await createNewAsset(group, defaultAssetData);

				const topicsDataForMobileAsset = [
					{
						topicType: "dev2pdb",
						description: `Mobile geolocation topic`,
						mqttAccessControl: "Pub & Sub",
						payloadJsonSchema: "{}",
						requireS3Storage: false,
						s3Folder: "",
						parquetSchema: "{}",
					},
					{
						topicType: "dev2pdb_wt",
						description: `Mobile accelerations topic`,
						mqttAccessControl: "Pub & Sub",
						payloadJsonSchema: "{}",
						requireS3Storage: false,
						s3Folder: "",
						parquetSchema: "{}",
					},
					{
						topicType: "dev2pdb_wt",
						description: `Mobile orientation topic`,
						mqttAccessControl: "Pub & Sub",
						payloadJsonSchema: "{}",
						requireS3Storage: false,
						s3Folder: "",
						parquetSchema: "{}",
					},
					{
						topicType: "dev2pdb_wt",
						description: `Mobile motion topic`,
						mqttAccessControl: "Pub & Sub",
						payloadJsonSchema: "{}",
						requireS3Storage: false,
						s3Folder: "",
						parquetSchema: "{}",
					},
					{
						topicType: "dev2dtm",
						description: `Mobile photo topic`,
						mqttAccessControl: "Pub & Sub",
						payloadJsonSchema: "{}",
						requireS3Storage: false,
						s3Folder: "",
						parquetSchema: "{}",
					}
				];

				const topics: ITopic[] = [];
				for (let i = 0; i < topicsDataForMobileAsset.length; i++) {
					topics[i] = await createTopic(group.id, topicsDataForMobileAsset[i]);
				}

				const sensorsData: CreateSensorDto[] = [];
				const sensors: ISensor[] = [];
				const dashboarsId: number[] = [];
				const sensorsUid: string[] = [];
				sensorsData[0] =
				{
					description: `Mobile geolocation`,
					topicId: topics[0].id,
					type: "geolocation",
					payloadKey: "mobile_geolocation",
					paramLabel: "longitude,latitude",
					valueType: "number(2)",
					units: "-",
					dashboardRefresh: "1s",
					dashboardTimeWindow: "5m"
				};
				sensorsUid[0] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[1] =
				{
					description: `Mobile accelerations`,
					topicId: topics[1].id,
					type: "accelerometer",
					payloadKey: "mobile_accelerations",
					paramLabel: "ax,ay,az",
					valueType: "number(3)",
					units: "m/s^2",
					dashboardRefresh: "200ms",
					dashboardTimeWindow: "25s"
				};
				sensorsUid[1] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[2] =
				{
					description: `Mobile orientation`,
					topicId: topics[2].id,
					type: "quaternion",
					payloadKey: "mobile_quaternion",
					paramLabel: "q0,q1,q2,q3",
					valueType: "number(4)",
					units: "-",
					dashboardRefresh: "200ms",
					dashboardTimeWindow: "25s"
				};
				sensorsUid[2] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[3] =
				{
					description: `Mobile motion`,
					topicId: topics[3].id,
					type: "mobile_motion",
					payloadKey: "mobile_motion",
					paramLabel: "ax,ay,az,q0,q1,q2,q3",
					valueType: "number(7)",
					units: "-",
					dashboardRefresh: "200ms",
					dashboardTimeWindow: "25s"
				};
				sensorsUid[3] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				sensorsData[4] =
				{
					description: `Mobile photo`,
					topicId: topics[4].id,
					type: "photo_camera",
					payloadKey: "mobile_photo",
					paramLabel: "mobile_photo",
					valueType: "string",
					units: "-",
					dashboardRefresh: "1s",
					dashboardTimeWindow: "5m"
				};
				sensorsUid[4] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

				for (let i = 0; i < 5; i++) {
					dashboarsId[i] = await createSensorDashboard(group, sensorsData[i], sensorsUid[i]);
				}

				const dashboardsInfo = await getDashboardsInfoFromIdArray(dashboarsId);
				const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
				for (let i = 0; i < 5; i++) {
					sensors[i] = await createNewSensor(asset.id, sensorsData[i], dashboarsId[i], dashboardsUrl[i], sensorsUid[i]);
				}

				const digitalTwinData = {
					description: "Mobile phone default DT",
					type: "Gltf 3D model",
					digitalTwinUid: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
					topicSensorTypes: ["dev2pdb_wt"],
					maxNumResFemFiles: 1,
					digitalTwinSimulationFormat: "{}",
					dtRefFileName: "-",
					dtRefFileLastModifDate: "-",
					topicsRef: [
						{
							topicRef: "dev2pdb_wt_1",
							topicId: topics[2].id
						}
					],
					sensorsRef: [] as CreateSensorRefDto[]
				}
				const { digitalTwin } = await createDigitalTwin(group, asset, digitalTwinData);
				const keyBase = `org_${newOrg.id}/group_${group.id}/digitalTwin_${digitalTwin.id}`;
				const gltfFileName = `${keyBase}/gltfFile/mobile_phone.gltf`
				await uploadMobilePhoneGltfFile(gltfFileName);
			}
			const message = { message: "Organization created successfully" }
			infoLogger(req, res, 200, message.message);
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
				throw new HttpException(
					req,
					res,
					400,
					"The same values of name, login and email of some of the users is already taken."
				)
			let user_msg: IMessage;
			if (!orgUserData.roleInOrg) orgUserData.roleInOrg = "Viewer";
			else {
				if (!req.user.isGrafanaAdmin && orgUserData.roleInOrg === "Admin") {
					throw new HttpException(
						req,
						res,
						401,
						"To assign organization admin role to a user, platform administrator privileges are needed."
					);
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
			infoLogger(req, res, 200, message.message);
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
						throw new HttpException(
							req,
							res,
							401,
							"To assign organization admin role to a user, platform administrator privileges are needed."
						);
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
					throw new HttpException(
						req,
						res,
						400,
						"The same values of name, login and email of some of the users is already taken."
					)
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
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const user = await getOrganizationUserByProp(organization.id, propName, propValue);
			if (!user) throw new ItemNotFoundException(req, res, "The user", propName, propValue);
			if (user.isGrafanaAdmin) {
				throw new HttpException(
					req,
					res,
					403,
					"A platform administrator user cannot be removed from an org."
				)
			}
			if (user.login.slice(-9) === "api_admin") {
				throw new HttpException(
					req,
					res,
					403,
					"An api admin user can not be removed from the org."
				)
			}
			const groupsArray = await getGroupsOfOrgIdWhereUserIdIsMember(organization.id, user.userId);
			if (groupsArray.length !== 0) {
				const groupMember = await getGroupMemberByProp(groupsArray[0], "id", user.userId);
				await removeMembersInGroupsArray(groupsArray, [groupMember]);
			}
			await grafanaApi.removeUserFromOrganization(organization.id, user.userId);
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
			if (!this.isValidWhoToRemove(whoToRemove)) throw new InvalidPropNameExeception(req, res, whoToRemove);
			const { organization } = req;
			if (!req.user.isGrafanaAdmin && whoToRemove === "allUsers") {
				throw new HttpException(
					req,
					res,
					401,
					"To remove organization admin users, platform administrator privileges are needed."
				);
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
			await grafanaApi.removeUsersFromOrganization(organization.id, usersIdArray);
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
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const existUserInOrg = await getOrganizationUserWithGrafanaAdminByProp(organization.id, propName, propValue);
			if (!existUserInOrg) throw new ItemNotFoundException(req, res, "The user", propName, propValue);
			const userInOrgData: UserInOrgToUpdateDto = req.body;
			if (userInOrgData.roleInOrg) {
				if (!req.user.isGrafanaAdmin && userInOrgData.roleInOrg === "Admin") {
					throw new HttpException(
						req,
						res,
						401,
						"To assign organization admin role to a user, platform administrator privileges are needed."
					);
				}
				if (!req.user.isGrafanaAdmin && existUserInOrg.isGrafanaAdmin) {
					throw new HttpException(
						req,
						res,
						401,
						"The role in the org of the platform administrator only can be modify by himself."
					);
				}
				if (userInOrgData.roleInOrg !== existUserInOrg.roleInOrg) {
					await grafanaApi.changeUserRoleInOrganization(organization.id, existUserInOrg.userId, userInOrgData.roleInOrg);
					await updateOrgUserRoleInDefaultOrgGroup(organization.id, existUserInOrg, userInOrgData.roleInOrg);
				}
			}
			const message = { message: `User role in org updated succesfully.` }
			infoLogger(req, res, 200, message.message);
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
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const user = await getOrganizationUserByProp(organization.id, propName, propValue);
			if (!user) throw new ItemNotFoundException(req, res, "The user", propName, propValue);
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
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const organization = await getOrganizationByProp(propName, propValue);
			if (!organization) throw new ItemNotFoundException(req, res, "The organization", propName, propValue);
			res.status(200).send(organization);
		} catch (error) {
			next(error);
		}
	};

	private modifyOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const orgDataToUpdate: UpdateOrganizationDto = req.body;
			const oldOrganizationData = await getOrganizationByProp(propName, propValue);
			if (!oldOrganizationData) throw new ItemNotFoundException(req, res, "The organization", propName, propValue);
			const newOrganizationData = { ...oldOrganizationData, ...orgDataToUpdate };
			const currentNodeRedInstanceInOrg = await getNodeRedInstancesByOrgsIdArray([oldOrganizationData.id]);
			await updateNodeRedInstancesInOrg(currentNodeRedInstanceInOrg, newOrganizationData);
			await updateOrganizationByProp(propName, propValue, newOrganizationData);
			res.status(200).json({ message: `Organization updated successfully` });
		} catch (error) {
			next(error);
		}
	};

	private deleteOrganizationByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidOrganizationPropName(propName)) throw new InvalidPropNameExeception(req, res, propName);
			const organization = await getOrganizationByProp(propName, propValue);
			if (!organization) throw new ItemNotFoundException(req, res, "The Organization", propName, propValue);
			if (organization.id === 1) throw new HttpException(
				req,
				res,
				400,
				"Main organization can not be deleted"
			);
			await grafanaApi.switchOrgContextForAdmin(1);
			await grafanaApi.deleteOrgApiAdminUser(organization.id);
			const deleteOrgMessage = await grafanaApi.deleteOrganizationById(organization.id);
			const bucketFolder = `org_${organization.id}`;
			await removeFilesFromBucketFolder(bucketFolder);
			console.log("deleteOrgMessage=", deleteOrgMessage)
			if (deleteOrgMessage.message === "Organization deleted") {
				res.status(200).json({ message: `Organization deleted successfully` });
			} else {
				throw new HttpException(
					req,
					res,
					400,
					`Organization with id=${organization.id} could not be deleted`
				);
			}
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