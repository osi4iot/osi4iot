import { Router, NextFunction, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { userAuth, groupViewerAuth, groupEditorAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import groupExists from "../../middleware/groupExists.middleware";
import UpdateMeasurementDto from "./measurementUpdate.dto";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import {
	deleteMeasurement,
	deleteMeasurementsBeforeDate,
	getDuringMeasurementsWithPagination,
	getLastMeasurementsFromTopicsArray,
	getLastMeasurements,
	getMeasurement,
	updateMeasurement,
	getDuringSensorMeasurementsWithPagination,
	getTotalRowsDuringSensorMeasurements,
	getTotalRowsDuringMeasurements,
	getSensorMeasurementsBeforeDate,
	deleteSensorMeasurementsBeforeSomeDate,
	topicFieldPath,
	getLastGeolocationMeasurementsFromSensorsArray
} from "./measurementDAL";
import HttpException from "../../exceptions/HttpException";
import MeasurementRequestBodyDto from "./measurementRequestBody.dto";
import MeasurementsWithPaginationDto from "./measurementsWithPagination.dto";
import DeleteMeasurementsBeforeDateDto from "./deleteMeasurementsBeforeDate.dto";
import LastMeasurementsDto from "./lastMeasurementsDto";
import LastMeasurementsForTopicsIdArrayDto from "./lastMeasurmentsForTopicsIdArrayDto";
import { getMqttTopicsInfoFromIdArray } from "../topic/topicDAL";
import { generateSqlTopic } from "../digitalTwin/digitalTwinDAL";
import SensorMeasurementsWithPaginationDto from "./sensorMeasurementsWithPagination.dto";
import { getAllGeolocationSensors, getGeolocationSensorsByGroupsIdArray, getSensorByPropName, getSensorTypeByPropName } from "../sensor/sensorDAL";
import { tablePath, toMeasurements, valueAtPath, withValueAtPath, withoutValueAtPath } from "../../utils/measurements/measurements";
import SensorMeasurementRequestBodyDto from "./sensorMeasurementRequestBody.dto";
import DeleteSensorMeasurementsBeforeDateDto from "./deleteSensorMeasurementsBeforeDate.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import ISensor from "../sensor/sensor.interface";
import { getAllGroupsInOrgArray, getGroupsThatCanBeEditatedAndAdministratedByUserId } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";

class MeasurementController implements IController {
	public path = "/measurement";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.post(
				`${this.path}/:groupId`,
				groupExists,
				groupViewerAuth,
				validationMiddleware<MeasurementRequestBodyDto>(MeasurementRequestBodyDto),
				this.getMeasurement
			)
			.post(
				`${this.path}s_last/:groupId`,
				groupExists,
				groupViewerAuth,
				validationMiddleware<LastMeasurementsDto>(LastMeasurementsDto),
				this.getLastMeasurements
			)
			.post(
				`${this.path}s_last_from_topicsid_array/:groupId`,
				groupExists,
				groupViewerAuth,
				validationMiddleware<LastMeasurementsForTopicsIdArrayDto>(LastMeasurementsForTopicsIdArrayDto),
				this.getLastMeasurementsFromTopicsIdArray
			)
			.get(
				`${this.path}_last_of_assets_geolocation/user_managed/`,
				userAuth,
				this.getLastMeasurementOfAssetsGeolocation
			)
			.post(
				`${this.path}s_pagination/:groupId`,
				groupExists,
				groupViewerAuth,
				validationMiddleware<MeasurementsWithPaginationDto>(MeasurementsWithPaginationDto),
				this.getMeasurementsWithPagination
			)
			.post(
				`/sensor_measurements_pagination/:groupId`,
				groupExists,
				groupViewerAuth,
				validationMiddleware<SensorMeasurementsWithPaginationDto>(SensorMeasurementsWithPaginationDto),
				this.getSensorMeasurementsWithPagination
			)
			.patch(
				`${this.path}/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<UpdateMeasurementDto>(UpdateMeasurementDto),
				this.updateMeasurement
			)
			.delete(
				`${this.path}/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<MeasurementRequestBodyDto>(MeasurementRequestBodyDto),
				this.deleteMeasurement
			)
			.delete(
				`/sensor_measurement/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<SensorMeasurementRequestBodyDto>(SensorMeasurementRequestBodyDto),
				this.deleteSensorMeasurement
			)
			.delete(
				`${this.path}s_before_date/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<DeleteMeasurementsBeforeDateDto>(DeleteMeasurementsBeforeDateDto),
				this.deleteMeasurementsBeforeDate
			)
			.delete(
				`/sensor_measurements_before_date/:groupId`,
				groupExists,
				groupEditorAuth,
				validationMiddleware<DeleteSensorMeasurementsBeforeDateDto>(DeleteSensorMeasurementsBeforeDateDto),
				this.deleteSensorMeasurementsBeforeDate
			)
	}


	private getMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, timestamp } = req.body;
			const measurement = await getMeasurement(groupUid, topic, timestamp);
			res.status(200).send(measurement);
		} catch (error) {
			next(error);
		}
	};

	private getLastMeasurements = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const topic = req.body.topic;
			const count = parseInt(req.body.count, 10);
			const measurement = await getLastMeasurements(groupUid, topic, count);
			res.status(200).send(measurement);
		} catch (error) {
			next(error);
		}
	};

	private getLastMeasurementsFromTopicsIdArray = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const topicsId = req.body.topicsIdArray;
			const topicsInfo = await getMqttTopicsInfoFromIdArray(topicsId);
			const topicsArray: string[] = [];
			topicsInfo.forEach(topicInfo => {
				const sqlTopic = generateSqlTopic(topicInfo);
				topicsArray.push(sqlTopic);
			});
			const measurements = await getLastMeasurementsFromTopicsArray(groupUid, topicsArray);
			res.status(200).send(measurements);
		} catch (error) {
			next(error);
		}
	};

	private getLastMeasurementOfAssetsGeolocation = async (
		req: IRequestWithUser,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			let sensors: ISensor[] = [];
			if (req.user.isGrafanaAdmin) {
				sensors = await getAllGeolocationSensors();
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
					sensors = await getGeolocationSensorsByGroupsIdArray(groupsIdArray);
				}
			}
			const lastGeolocationMeasurements = await getLastGeolocationMeasurementsFromSensorsArray(sensors);
			res.status(200).send(lastGeolocationMeasurements);
		} catch (error) {
			next(error);
		}
	};

	private getMeasurementsWithPagination = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, startDate, endDate, pageIndex, itemsPerPage } = req.body;
			const measurements = await getDuringMeasurementsWithPagination(groupUid, topic, startDate, endDate, pageIndex, itemsPerPage);
			if (pageIndex === 0 && measurements.length !== 0) {
				measurements[0].totalRows = await getTotalRowsDuringMeasurements(groupUid, topic, startDate, endDate)
			}
			res.status(200).send(measurements);
		} catch (error) {
			next(error);
		}
	};

	private getSensorMeasurementsWithPagination = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { sensorId, startDate, endDate, pageIndex, itemsPerPage } = req.body;
			const sensor = await getSensorByPropName("id", sensorId);
			if (!sensor) throw new ItemNotFoundException(req, res, "The sensor", "id", sensorId);
			const topic = `Topic_${sensor.topicUid}`;
			// campo de los mensajes: uno de los que mide el sensor (o su tipo), por defecto el primero
			let sensorMeasurements = toMeasurements(sensor.measurements);
			if (Object.keys(sensorMeasurements).length === 0) {
				const sensorType = await getSensorTypeByPropName(sensor.orgId, "id", sensor.sensorTypeId);
				sensorMeasurements = toMeasurements(sensorType?.defaultMeasurements);
			}
			const measurementKeys = Object.keys(sensorMeasurements);
			const requestedKey = req.body.payloadKey as string | undefined;
			const payloadKey = requestedKey && measurementKeys.includes(requestedKey) ? requestedKey : measurementKeys[0];
			if (payloadKey === undefined) {
				res.status(200).send([]);
				return;
			}
			const measurements = await getDuringSensorMeasurementsWithPagination(
				groupUid,
				topic,
				startDate,
				endDate,
				pageIndex,
				itemsPerPage,
				payloadKey,
				tablePath(payloadKey, sensorMeasurements[payloadKey])
			);
			if (pageIndex === 0 && measurements.length !== 0) {
				measurements[0].totalRows = await getTotalRowsDuringSensorMeasurements(
					groupUid,
					topic,
					startDate,
					endDate,
					tablePath(payloadKey, sensorMeasurements[payloadKey])
				)
			}
			res.status(200).send(measurements);
		} catch (error) {
			next(error);
		}
	};

	private updateMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { topic, timestamp, updatedPayload, payloadKey } = req.body;
			const groupUid = req.group.groupUid;
			const existMeasurement = await getMeasurement(groupUid, topic, timestamp);
			if (!existMeasurement) throw new ItemNotFoundException(req, res, "The measurement", "timestamp", timestamp);
			let newPayload = existMeasurement.payload;
			if (typeof payloadKey === "string" && payloadKey !== "") {
				// the table of a sensor: only its field changes, the rest of the message stays
				let edited: unknown = updatedPayload;
				if (typeof edited === "string") {
					try {
						edited = JSON.parse(edited);
					} catch {
						throw new HttpException(req, res, 400, "The measurement is not valid JSON");
					}
				}
				const path = await topicFieldPath(Number(req.group.id), topic, payloadKey);
				const value = valueAtPath(edited, path);
				if (value === undefined) throw new HttpException(req, res, 400, `The measurement has no ${path.join(".")}`);
				newPayload = withValueAtPath(existMeasurement.payload, path, value) as typeof newPayload;
			} else if (JSON.stringify(existMeasurement.payload) !== JSON.stringify(updatedPayload)) {
				newPayload = updatedPayload;
			}
			const response = await updateMeasurement(groupUid, topic, timestamp, newPayload);
			if (!response) throw new HttpException(req, res, 500, "The measurement could not be updated");
			const message = { message: `Measurement updated succesfully.` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, timestamp } = req.body;
			const existMeasurement = await getMeasurement(groupUid, topic, timestamp);
			if (!existMeasurement) throw new ItemNotFoundException(req, res, "The measurement", "timestamp", timestamp);
			const response = await deleteMeasurement(groupUid, topic, timestamp);
			if (!response) throw new HttpException(req, res, 500, "Any measurement has been deleted");
			const message = { message: `Measurement deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteSensorMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, payloadKey, timestamp } = req.body;
			const existMeasurement = await getMeasurement(groupUid, topic, timestamp);
			if (!existMeasurement) throw new ItemNotFoundException(req, res, "The measurement", "timestamp", timestamp);
			// the value of the sensor's field out of the message (at its path); nothing left: the message out
			const path = await topicFieldPath(Number(req.group.id), topic, String(payloadKey ?? ""));
			const { payload, found } = withoutValueAtPath(existMeasurement.payload, path);
			if (!found) throw new ItemNotFoundException(req, res, "The sensor measurement", "timestamp", timestamp);
			if (payload === undefined || (typeof payload === "object" && payload !== null && Object.keys(payload).length === 0)) {
				const response = await deleteMeasurement(groupUid, topic, timestamp);
				if (!response) throw new HttpException(req, res, 500, "Any measurement has been deleted");
			} else {
				const response = await updateMeasurement(groupUid, topic, timestamp, JSON.stringify(payload));
				if (!response) throw new HttpException(req, res, 500, "The sensor measurement could not be deleted");
			}
			const message = { message: `Sensor measurement deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteMeasurementsBeforeDate = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, deleteDate } = req.body;
			const response = await deleteMeasurementsBeforeDate(groupUid, topic, deleteDate);
			if (!response) throw new HttpException(req, res, 500, "Any measurement has been deleted");
			const message = { message: `Measurements deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteSensorMeasurementsBeforeDate = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, payloadKey, deleteDate } = req.body;
			const measurements = await getSensorMeasurementsBeforeDate(groupUid, topic, deleteDate);
			if (measurements.length === 0) throw new HttpException(req, res, 500, "None one measurement has been founded");
			const path = await topicFieldPath(Number(req.group.id), topic, String(payloadKey ?? ""));
			const numMeasurementsDeleted = await deleteSensorMeasurementsBeforeSomeDate(measurements, path, groupUid, topic);
			const message = { message: `Have been deleted ${numMeasurementsDeleted} measurements succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};
}

export default MeasurementController;
