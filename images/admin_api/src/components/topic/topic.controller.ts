import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { basicGroupAdminAuth, groupAdminAuth, organizationAdminAuth, userAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import groupExists from "../../middleware/groupExists.middleware";
import organizationExists from "../../middleware/organizationExists.middleware";
import CreateTopicDto from "./topic.dto";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import { getDashboardsDataWithRawSqlOfGroup, updateDashboardsDataRawSqlOfDevice } from "../group/dashboardDAL";
import LoginDto from "../Authentication/login.dto";
import { updateDeviceUidRawSqlAlertSettingOfGroup } from "../group/alertDAL";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import ITopic from "./topic.interface";
import { getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { changeTopicUidByUid, createTopic, deleteTopicById, getAllTopics, getTopicByProp, getTopicsByGroupId, getTopicsByGroupsIdArray, getTopicsByOrgId, updateTopicById } from "./topicDAL";
import deviceAndGroupExist from "../../middleware/deviceAndGroupExist.middleware";

class TopicController implements IController {
	public path = "/topic";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}s/user_managed/`,
				userAuth,
				this.getTopicsManagedByUser
			)
			.get(
				`${this.path}s_in_org/:orgId/`,
				organizationAdminAuth,
				organizationExists,
				this.getTopicsInOrg
			)
			.get(
				`${this.path}s_in_group/:groupId`,
				groupExists,
				groupAdminAuth,
				this.getTopicsInGroup
			)
			.patch(
				`${this.path}/:groupId/changeUid/:topicId`,
				groupExists,
				groupAdminAuth,
				this.changeTopicUid
			)
			.get(
				`${this.path}/:groupId/:propName/:propValue`,
				groupExists,
				groupAdminAuth,
				this.getTopicByProp
			)
			.post(
				`${this.path}_information/:groupId/:topicId`,
				groupExists,
				validationMiddleware<LoginDto>(LoginDto),
				basicGroupAdminAuth,
				this.getTopicInformationById
			)
			.delete(
				`${this.path}/:groupId/:deviceId/:topicId`,
				deviceAndGroupExist,
				groupAdminAuth,
				this.deleteTopicById
			)
			.patch(
				`${this.path}/:groupId/:deviceId/:topicId`,
				deviceAndGroupExist,
				groupAdminAuth,
				validationMiddleware<CreateTopicDto>(CreateTopicDto, true),
				this.updateTopicById
			)
			.post(
				`${this.path}/:groupId/:deviceId`,
				deviceAndGroupExist,
				groupAdminAuth,
				validationMiddleware<CreateTopicDto>(CreateTopicDto, true),
				this.createTopic
			)

	}

	private getTopicsManagedByUser = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let topics: ITopic[] = [];
			if (req.user.isGrafanaAdmin) {
				topics = await getAllTopics();
			} else {
				const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(req.user.id);
				if (groups.length !== 0) {
					const groupsIdArray = groups.map(group => group.id);
					topics = await getTopicsByGroupsIdArray(groupsIdArray);
				}
			}
			res.status(200).send(topics);
		} catch (error) {
			next(error);
		}
	};

	private getTopicsInOrg = async (
		req: IRequestWithOrganization,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const topics = await getTopicsByOrgId(req.organization.id);
			res.status(200).send(topics);
		} catch (error) {
			next(error);
		}
	};

	private getTopicsInGroup = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const topics = await getTopicsByGroupId(req.group.id);
			res.status(200).send(topics);
		} catch (error) {
			next(error);
		}
	};

	private getTopicByProp = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidTopicPropName(propName)) throw new InvalidPropNameExeception(propName);
			const topic = await getTopicByProp(propName, propValue);
			if (!topic) throw new ItemNotFoundException("The topic", propName, propValue);
			res.status(200).json(topic);
		} catch (error) {
			next(error);
		}
	};

	private getTopicInformationById = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { topicId } = req.params;
			const topic = await getTopicByProp("id", topicId);
			if (!topic) throw new ItemNotFoundException("The topic", "id", topicId);
			res.status(200).json(topic);
		} catch (error) {
			next(error);
		}
	};

	private deleteTopicById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { topicId } = req.params;
			const topic = await getTopicByProp("id", topicId);
			if (!topic) throw new ItemNotFoundException("The topic", "id", topicId);
			await deleteTopicById(parseInt(topicId, 10));
			const message = { message: "Topic deleted successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private updateTopicById = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const topicData = req.body;
			const { topicId } = req.params;
			const topic = await getTopicByProp("id", topicId);
			if (!topic) throw new ItemNotFoundException("The topic", "id", topicId);
			const topicUpdate = { ...topic, ...topicData };
			await updateTopicById(parseInt(topicId, 10), topicUpdate);
			const message = { message: "Topic updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private changeTopicUid = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { topicId } = req.params;
			const topic = await getTopicByProp("id", topicId);
			if (!topic) throw new ItemNotFoundException("The topic", "id", topicId);
			const dashboards = await getDashboardsDataWithRawSqlOfGroup(req.group);
			const newTopicUid = await changeTopicUidByUid(topic);
			// await updateDashboardsDataRawSqlOfDevice(topic, newDeviceUid, dashboards);
			//  await updateDeviceUidRawSqlAlertSettingOfGroup(req.group, topic.topicUid, newDeviceUid);
			const message = { newTopicUid };
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};


	private createTopic = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const topicData: CreateTopicDto = req.body;
			const deviceId = parseInt(req.params.deviceId, 10);
			let message: { message: string };
			const existTopic = await getTopicByProp("sensor_name", topicData.sensorName)
			if (!existTopic) {
				await createTopic(deviceId, topicData);
				message = { message: `A new topic has been created` };
			} else {
				message = { message: `The topic with sensor name: ${topicData.sensorName} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidTopicPropName = (propName: string) => {
		const validPropName = ["id", "sensor_name", "topicUid"];
		return validPropName.indexOf(propName) !== -1;
	};

}

export default TopicController;