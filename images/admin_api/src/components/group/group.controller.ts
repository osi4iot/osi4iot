import { Router, NextFunction, Request, Response } from "express";
import pointOnFeature from '@turf/point-on-feature';
import { point, polygon } from '@turf/helpers';
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import groupExists from "../../middleware/groupExists.middleware";
import { organizationAdminAuth, groupAdminAuth, userAuth } from "../../middleware/auth.middleware";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import AlreadyExistingItemException from "../../exceptions/AlreadyExistingItemException";
import CreateGroupDto from "./interfaces/group.dto";
import {
	addMembersToGroup,
	changeGroupUidByUid,
	createGroup,
	deleteGroup,
	getAllGroups,
	getAllGroupsInOrganization,
	getAllGroupsInOrgArray,
	getGroupByProp,
	getGroupByWithFolderPermissionProp,
	getGroupMemberByProp,
	getGroupMembers,
	getGroupMembersByEmailsArray,
	getGroupMembersInTeamIdArray,
	getGroupsManagedByUserId,
	getNumberOfGroupMemberWithAdminRole,
	groupsWhichTheLoggedUserIsMember,
	removeMembersInGroup,
	udpateRoleMemberInGroup,
	updateGroup
} from "./groupDAL";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import { getOrganizationKey, getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import { getOrganizationUserByProp, getOrganizationUsersByEmailArray, isThisUserOrgAdmin } from "../user/userDAL";
import HttpException from "../../exceptions/HttpException";
import CreateGroupMembersArrayDto from "./interfaces/groupMembersArray.dto";
import IRequestWithGroup from "./interfaces/requestWithGroup.interface";
import CreateGroupMemberDto from "./interfaces/groupMember.dto";
import IRequestWithUserAndGroup from "./interfaces/requestWithUserAndGroup.interface";
import UpdateGroupDto from "./interfaces/group_update.dto";
import UpdateGroupMemberDto from "./interfaces/groupMemberUpdate.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import IGroup from "./interfaces/Group.interface";
import { createDemoDashboards, getDashboardsDataWithRawSqlOfGroup, updateDashboardsDataRawSqlOfGroup } from "./dashboardDAL";
import { createDevice, defaultGroupDeviceName } from "../device/deviceDAL";
import { updateGroupUidOfRawSqlAlertSettingOfGroup } from "./alertDAL";
import IUser from "../user/interfaces/User.interface";
import { createTopic, demoTopicName } from "../topic/topicDAL";
import { createDigitalTwin, demoDigitalTwinDescription, generateDigitalTwinUid } from "../digitalTwin/digitalTwinDAL";
import { getFloorByOrgIdAndFloorNumber } from "../building/buildingDAL";
import { findGroupGeojsonData } from "../../utils/geolocation.ts/geolocation";
import {
	assignNodeRedInstanceToGroup,
	markAsDeleteNodeRedInstancesInGroup,
	getNodeRedInstancesInGroup,
	getNodeRedInstancesUnassignedInOrg,
	updateNodeRedInstanceIconById,
} from "../nodeRedInstance/nodeRedInstanceDAL";
import UpdateGroupManagedDto from "./interfaces/groupManagedUpdate.dto";
import rhumbDestination from "@turf/rhumb-destination";

class GroupController implements IController {
	public path = "/group";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getGroupsManagedByUser
			)
			.patch(
				`${this.path}_user_managed/:groupId/`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateGroupManagedDto>(UpdateGroupManagedDto),
				this.updateGroupManagedById
			)
			.get(
				`/group_members/user_managed/`,
				userAuth,
				this.getGroupMembersForGroupsManagedByUser
			)
			.get(
				`${this.path}s/which_the_logged_user_is_member/`,
				userAuth,
				this.getGroupsWhichTheLoggedUserIsMember
			);

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
			.patch(
				`${this.path}/:groupId/change_uid/`,
				groupExists,
				groupAdminAuth,
				this.changeGroupUid
			)

		this.router
			.post(
				`${this.path}/:groupId/members/`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateGroupMembersArrayDto>(CreateGroupMembersArrayDto),
				this.addMembersToGroup
			)
			.get(
				`${this.path}/:groupId/members/`,
				groupExists,
				groupAdminAuth,
				this.getGroupMembers
			)
			.get(
				`${this.path}/:groupId/members_editor_or_admin/`,
				groupExists,
				groupAdminAuth,
				this.getGroupMembersWithAdminOrEditorRole
			)
			.patch(
				`${this.path}/:groupId/members/`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateGroupMembersArrayDto>(CreateGroupMembersArrayDto),
				this.updateGroupMembers
			)
			.delete(
				`${this.path}/:groupId/members/`,
				groupExists,
				groupAdminAuth,
				this.removeGroupMembers
			)

		this.router
			.post(
				`${this.path}/:groupId/member/`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<CreateGroupMemberDto>(CreateGroupMemberDto),
				this.addMemberToGroup
			)
			.get(
				`${this.path}/:groupId/member/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getGroupMemberByProp
			)
			.patch(
				`${this.path}/:groupId/member/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateGroupMemberDto>(UpdateGroupMemberDto),
				this.updateGroupMemberByProp
			)
			.delete(
				`${this.path}/:groupId/member/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.removeGroupMemberByProp
			)

		this.router
			.get(
				`${this.path}/:orgId/:propName/:propValue/`,
				organizationAdminAuth,
				organizationExists,
				this.getGroupByProp
			)
			.patch(
				`${this.path}/:orgId/:propName/:propValue/`,
				organizationAdminAuth,
				organizationExists,
				validationMiddleware<UpdateGroupDto>(UpdateGroupDto, true),
				this.updateGroupByProp
			)
			.delete(
				`${this.path}/:orgId/:propName/:propValue/`,
				organizationAdminAuth,
				organizationExists,
				this.deleteGroupByProp
			);
	}

	private groupsManagedByUsers = async (user: IUser): Promise<IGroup[]> => {
		let groups: IGroup[] = [];
		if (user.isGrafanaAdmin) {
			groups = await getAllGroups();
		} else {
			groups = await getGroupsManagedByUserId(user.id);
			const organizations = await getOrganizationsManagedByUserId(user.id);
			if (organizations.length !== 0) {
				const orgIdsArray = organizations.map(org => org.id);
				const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray)
				const groupsIdArray = groups.map(group => group.id);
				groupsInOrgs.forEach(groupInOrg => {
					if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
				})
			}
		}
		return groups;
	}

	private getGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groups = await this.groupsManagedByUsers(req.user);
			res.status(200).send(groups);
		} catch (error) {
			next(error);
		}
	};

	private getGroupsWhichTheLoggedUserIsMember = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groups = await groupsWhichTheLoggedUserIsMember(req.user.id);
			res.status(200).send(groups);
		} catch (error) {
			next(error);
		}
	};

	private getGroupMembersForGroupsManagedByUser = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groups = await this.groupsManagedByUsers(req.user);
			const teamIdsArray = groups.map(group => group.teamId);
			const groupMembers = await getGroupMembersInTeamIdArray(teamIdsArray);
			res.status(200).send(groupMembers);
		} catch (error) {
			next(error);
		}
	};

	private createGroup = async (req: IRequestWithOrganization, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupInput: CreateGroupDto = req.body;
			groupInput.acronym = groupInput.acronym.replace(/ /g, "_").toUpperCase();
			groupInput.email = `${groupInput.acronym.toLocaleLowerCase()}@test.com`;
			const orgId = parseInt(req.params.orgId, 10);
			const existentGroup = await getGroupByProp("name", groupInput.name);
			if (existentGroup) throw new AlreadyExistingItemException("A", "Group", ["name"], [groupInput.name]);
			const usersArray = await getOrganizationUsersByEmailArray(orgId, groupInput.groupAdminDataArray.map(user => user.email));
			const nodeRedInstancesUnlinkedInOrg = await getNodeRedInstancesUnassignedInOrg(orgId);
			if (nodeRedInstancesUnlinkedInOrg.length === 0) {
				throw new HttpException(400, `The org with id: ${orgId} not have nodered instances available`)
			}
			if (usersArray.length !== groupInput.groupAdminDataArray.length) {
				throw new HttpException(404, "All the administrators of the group must be members of the organization");
			} else {
				usersArray.forEach((user, index) => {
					groupInput.groupAdminDataArray[index].userId = user.userId;
					groupInput.groupAdminDataArray[index].firstName = user.firstName;
					groupInput.groupAdminDataArray[index].surname = user.surname;
				});
			}
			const groupCreated = await createGroup(orgId, groupInput, req.organization.name);
			const floorData = await getFloorByOrgIdAndFloorNumber(groupCreated.orgId, groupCreated.floorNumber);
			const geoJsonDataString = findGroupGeojsonData(floorData, groupCreated.featureIndex);
			const geojsonObj = JSON.parse(geoJsonDataString);
			let centerGroupAreaLongitude = 0.0;
			let centerGroupAreaLatitude = 0.0;
			let deviceLongitude = 0.0;
			let deviceLatitude = 0.0;
			let nriLongitude = 0.0;
			let nriLatitude = 0.0;
			if (geojsonObj.features) {
				const geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
				const center = pointOnFeature(geoPolygon);
				centerGroupAreaLongitude = center.geometry.coordinates[0];
				centerGroupAreaLatitude = center.geometry.coordinates[1];
				const ptCenterGroupArea = point([centerGroupAreaLongitude, centerGroupAreaLatitude]);
				const ptDevice = rhumbDestination(ptCenterGroupArea, 0.001, 180);
				deviceLongitude = ptDevice.geometry.coordinates[0];
				deviceLatitude = ptDevice.geometry.coordinates[1];
				const ptNri = rhumbDestination(ptCenterGroupArea, 0.002, 0.0);
				nriLongitude = ptNri.geometry.coordinates[0];
				nriLatitude = ptNri.geometry.coordinates[1];
			}

			const defaultGroupDeviceData =
			{
				name: defaultGroupDeviceName(groupCreated),
				description: `Default device of group ${groupCreated.name}`,
				latitude: deviceLatitude,
				longitude: deviceLongitude,
				type: "Generic",
				iconRadio: 1.0,
				mqttAccessControl: "Pub & Sub"
			};
			const device = await createDevice(groupCreated, defaultGroupDeviceData);

			nodeRedInstancesUnlinkedInOrg[0].longitude = nriLongitude;
			nodeRedInstancesUnlinkedInOrg[0].latitude = nriLatitude;
			await assignNodeRedInstanceToGroup(nodeRedInstancesUnlinkedInOrg[0], groupCreated.id);

			const defaultDeviceTopicsData = [
				{
					topicType: "dev2pdb",
					topicName: demoTopicName(groupCreated, device, "Temperature"),
					description: `Temperature sensor for ${defaultGroupDeviceName(groupCreated)} device`,
					payloadFormat: '{"temp": {"type": "number", "unit":"°C"}}',
					mqttAccessControl: "Pub & Sub"
				},
				{
					topicType: "dev2pdb_wt",
					topicName: demoTopicName(groupCreated, device, "Accelerometer"),
					description: `Mobile accelerations for ${defaultGroupDeviceName(groupCreated)} device`,
					payloadFormat: '{"mobile_accelerations": {"type": "array", "items": { "ax": {"type": "number", "units": "m/s^2"}, "ay": {"type": "number", "units": "m/s^2"}, "az": {"type": "number","units": "m/s^2"}}}}',
					mqttAccessControl: "Pub & Sub"
				},
				{
					topicType: "dev2dtm",
					topicName: demoTopicName(groupCreated, device, "Photo"),
					description: `Mobile photo for ${defaultGroupDeviceName(groupCreated)} device`,
					payloadFormat: '{"mobile_photo": {"type": "string"}}',
					mqttAccessControl: "Pub & Sub"
				},
			];
			const topic1 = await createTopic(device.id, defaultDeviceTopicsData[0]);
			const topic2 = await createTopic(device.id, defaultDeviceTopicsData[1]);
			await createTopic(device.id, defaultDeviceTopicsData[2]);

			const dashboardsId: number[] = [];

			[dashboardsId[0], dashboardsId[1]] =
				await createDemoDashboards(req.organization.acronym, groupCreated, device, [topic1, topic2]);


			const defaultDeviceDigitalTwinsData = [
				{
					digitalTwinUid: generateDigitalTwinUid(),
					description: demoDigitalTwinDescription(groupCreated, "Temperature"),
					type: "Grafana dashboard",
					gltfFileName: "-",
					gltfFileLastModifDateString: "-",
					femSimDataFileName: "-",
					femSimDataFileLastModifDateString: "-",
					digitalTwinSimulationFormat: "{}"
				},
				{
					digitalTwinUid: generateDigitalTwinUid(),
					description: demoDigitalTwinDescription(groupCreated, "Accelerations"),
					type: "Grafana dashboard",
					gltfFileName: "-",
					gltfFileLastModifDateString: "-",
					femSimDataFileName: "-",
					femSimDataFileLastModifDateString: "-",
					digitalTwinSimulationFormat: "{}"
				},
			];

			await createDigitalTwin(groupCreated, device, defaultDeviceDigitalTwinsData[0], dashboardsId[0], topic1);
			await createDigitalTwin(groupCreated, device, defaultDeviceDigitalTwinsData[1], dashboardsId[1], topic2);

			const groupHash = `Group_${groupCreated.groupUid}`;
			const tableHash = `Table_${groupCreated.groupUid}`;
			const isOrgDefaultGroup = false;
			const group = { ...groupInput, isOrgDefaultGroup, groupHash, tableHash };
			const message = { message: `Group created successfully`, group }
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
			const group = await getGroupByWithFolderPermissionProp(propName, propValue);
			if (!group) throw new ItemNotFoundException("The group", propName, propValue);
			res.status(200).send(group);
		} catch (error) {
			next(error);
		}
	};

	private updateGroupByProp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupInput: UpdateGroupDto = req.body;
			const { propName, propValue } = req.params;
			if (!this.isValidGroupPropName(propName)) throw new InvalidPropNameExeception(propName);
			const existentGroup = await getGroupByWithFolderPermissionProp(propName, propValue);
			if (!existentGroup) throw new ItemNotFoundException("The group", propName, propValue);
			await updateGroup(groupInput, existentGroup);
			const message = { message: "Group updated successfully" }
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private updateGroupManagedById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { groupId } = req.params;
			const groupManagedInput: UpdateGroupManagedDto = req.body;
			const existentGroup = await getGroupByWithFolderPermissionProp("id", groupId);
			if (!existentGroup) throw new ItemNotFoundException("The group", "id", groupId);
			const nriId = groupManagedInput.nriInGroupId;
			const longitude = groupManagedInput.nriInGroupIconLongitude;
			const latitude = groupManagedInput.nriInGroupIconLatitude;
			const iconRadio = groupManagedInput.nriInGroupIconRadio;
			await updateNodeRedInstanceIconById(nriId, longitude, latitude, iconRadio);

			const folderPermission = groupManagedInput.folderPermission;
			const telegramInvitationLink = groupManagedInput.telegramInvitationLink;
			const telegramChatId = groupManagedInput.telegramChatId;
			const groupManagedUpdate = { ...existentGroup, folderPermission, telegramInvitationLink, telegramChatId };
			await updateGroup(groupManagedUpdate, existentGroup);
			const message = { message: "Group managed updated successfully" }
			res.status(200).send(message);
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
			const nriInGroup = await getNodeRedInstancesInGroup(group.id);
			if (nriInGroup) {
				await markAsDeleteNodeRedInstancesInGroup(group.id);
			}
			const orgKey = await getOrganizationKey(orgId);
			const message = await deleteGroup(group, orgKey);
			res.status(200).send({ message });
		} catch (error) {
			next(error);
		}
	};

	private isValidGroupPropName = (propName: string) => {
		const validPropName = ["id", "name", "acronym"];
		return validPropName.indexOf(propName) !== -1;
	}

	private addMembersToGroup = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const teamId = req.group.teamId;
			const orgId = req.group.orgId;
			const groupMembersArray: CreateGroupMemberDto[] = req.body.members;
			const usersArray = await getOrganizationUsersByEmailArray(orgId, groupMembersArray.map(user => user.email));
			if (usersArray.length !== groupMembersArray.length) {
				throw new HttpException(404, "All the members of the group must be members of its respective organization");
			} else {
				const isOrgAdminUser = await isThisUserOrgAdmin(req.user.id, req.group.orgId);
				groupMembersArray.forEach((member: CreateGroupMemberDto) => {
					if (member.roleInGroup) {
						if (!isOrgAdminUser && member.roleInGroup === "Admin") {
							throw new HttpException(401, "To assign group admin role to a user, organization administrator privileges are needed.");
						}
						if (member.roleInGroup === "Viewer" && req.group.folderPermission === "Edit") {
							throw new HttpException(401, "A roleInGroup: 'Viewer' when folderPermission: 'Edit' is not allowed.");
						}
					}
				});
				usersArray.forEach((user, index) => {
					groupMembersArray[index].userId = user.userId;
					groupMembersArray[index].firstName = user.firstName;
					groupMembersArray[index].surname = user.surname;
				});
			}
			const message = await addMembersToGroup(req.group, groupMembersArray);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private updateGroupMembers = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupMembersArray: CreateGroupMemberDto[] = req.body.members;
			const existentGroupMemberArray = await getGroupMembersByEmailsArray(req.group, groupMembersArray.map(user => user.email));
			if (existentGroupMemberArray.length !== groupMembersArray.length) {
				throw new HttpException(404, "All the members of the group must be members of its respective organization");
			} else {
				const isOrgAdminUser = await isThisUserOrgAdmin(req.user.id, req.group.orgId);
				const numMembersWithAdminRole = await getNumberOfGroupMemberWithAdminRole(req.group.teamId);
				let numAdminRoleToBeRemoved = 0;
				groupMembersArray.forEach((member: CreateGroupMemberDto, index) => {
					if (member.roleInGroup) {
						if (!isOrgAdminUser && member.roleInGroup === "Admin") {
							throw new HttpException(401, "To assign group admin role to a user, organization administrator privileges are needed.");
						}
						if (member.roleInGroup === "Viewer" && req.group.folderPermission === "Edit") {
							throw new HttpException(401, "A roleInGroup: 'Viewer' when folderPermission: 'Edit' is not allowed.");
						}
						if (existentGroupMemberArray[index].roleInGroup === "Admin" && member.roleInGroup !== "Admin") {
							numAdminRoleToBeRemoved++;
							if (numAdminRoleToBeRemoved === numMembersWithAdminRole) {
								throw new HttpException(405, "At least one group member must have admin role");
							}
						}
					}
				});
			}
			const message = await udpateRoleMemberInGroup(req.group, groupMembersArray, existentGroupMemberArray);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private updateGroupMemberByProp = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidGroupMemberPropName(propName)) throw new InvalidPropNameExeception(propName);
			const groupMemberRole: UpdateGroupMemberDto = req.body;
			const existentGroupMember = await getGroupMemberByProp(req.group, propName, propValue);
			if (!existentGroupMember) throw new ItemNotFoundException("The group member", propName, propValue);
			const groupMember = { ...existentGroupMember };
			groupMember.roleInGroup = groupMemberRole.roleInGroup;
			const isOrgAdminUser = await isThisUserOrgAdmin(req.user.id, req.group.orgId);
			if (groupMember.roleInGroup) {
				if (!isOrgAdminUser && groupMember.roleInGroup === "Admin") {
					throw new HttpException(401, "To assign group admin role to a user, organization administrator privileges are needed.");
				}
				if (groupMember.roleInGroup === "Viewer" && req.group.folderPermission === "Edit") {
					throw new HttpException(401, "A roleInGroup: 'Viewer' when folderPermission: 'Edit' is not allowed.");
				}
				if (existentGroupMember.roleInGroup === "Admin" && groupMember.roleInGroup !== "Admin") {
					const numMembersWithAdminRole = await getNumberOfGroupMemberWithAdminRole(req.group.teamId);
					if (numMembersWithAdminRole === 1) {
						throw new HttpException(405, "At least one group member must have admin role");
					}
				}
			}
			const message = await udpateRoleMemberInGroup(req.group, [groupMember], [existentGroupMember]);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};


	private addMemberToGroup = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const teamId = req.group.teamId;
			const orgId = req.group.orgId;
			const groupMember: CreateGroupMemberDto = req.body;
			const user = await getOrganizationUserByProp(orgId, "email", groupMember.email);
			if (!user) {
				throw new HttpException(404, "To be member of a group must be member of its respective organization");
			} else {
				const isOrgAdminUser = await isThisUserOrgAdmin(req.user.id, req.group.orgId);
				if (groupMember.roleInGroup) {
					if (!isOrgAdminUser && groupMember.roleInGroup === "Admin") {
						throw new HttpException(401, "To assign group admin role to a user, organization administrator privileges are needed.");
					}
					if (groupMember.roleInGroup === "Viewer" && req.group.folderPermission === "Edit") {
						throw new HttpException(401, "A roleInGroup: 'Viewer' when folderPermission: 'Edit' is not allowed.");
					}
				}
				groupMember.userId = user.userId;
				groupMember.firstName = user.firstName;
				groupMember.surname = user.surname;
			}
			const message = await addMembersToGroup(req.group, [groupMember]);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getGroupMembers = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupMembers = await getGroupMembers(req.group);
			res.status(200).send(groupMembers);
		} catch (error) {
			next(error);
		}
	};


	private getGroupMembersWithAdminOrEditorRole = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupMembers = await getGroupMembers(req.group);
			const groupMembersWithAdminOrEditorRole = groupMembers.filter(member => member.roleInGroup !== "Viewer");
			res.status(200).send(groupMembersWithAdminOrEditorRole);
		} catch (error) {
			next(error);
		}
	};

	private isValidGroupMemberPropName = (propName: string) => {
		const validPropName = ["id", "login", "email"];
		return validPropName.indexOf(propName) !== -1;
	}

	private getGroupMemberByProp = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidGroupMemberPropName(propName)) throw new InvalidPropNameExeception(propName);
			const groupMember = await getGroupMemberByProp(req.group, propName, propValue);
			if (!groupMember) throw new ItemNotFoundException("The group member", propName, propValue);
			res.status(200).send(groupMember);
		} catch (error) {
			next(error);
		}
	};

	private removeGroupMemberByProp = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidGroupMemberPropName(propName)) throw new InvalidPropNameExeception(propName);
			const groupMember = await getGroupMemberByProp(req.group, propName, propValue);
			if (!groupMember) throw new ItemNotFoundException("The group member", propName, propValue);
			if (groupMember.roleInGroup === "Admin") {
				const isOrgAdminUser = await isThisUserOrgAdmin(req.user.id, req.group.orgId);
				if (!isOrgAdminUser) {
					throw new HttpException(401, "To remove a member with admin role, organization administrator privileges are needed.");
				} else {
					const numMembersWithAdminRole = await getNumberOfGroupMemberWithAdminRole(req.group.teamId);
					if (numMembersWithAdminRole === 1) throw new HttpException(405, "At least one group member must have admin role");
				}
			}
			const message = await removeMembersInGroup(req.group, [groupMember]);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private removeGroupMembers = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const groupMembers = await getGroupMembers(req.group);
			const groupMembersToRemove = groupMembers.filter(member => member.roleInGroup !== "Admin");
			const message = await removeMembersInGroup(req.group, groupMembersToRemove);
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private changeGroupUid = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const dashboards = await getDashboardsDataWithRawSqlOfGroup(req.group);
			const newGroupUid = await changeGroupUidByUid(req.group);
			await updateDashboardsDataRawSqlOfGroup(req.group, newGroupUid, dashboards);
			await updateGroupUidOfRawSqlAlertSettingOfGroup(req.group, newGroupUid);
			const message = { message: "Group hash changed successfully" };
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

}

export default GroupController;