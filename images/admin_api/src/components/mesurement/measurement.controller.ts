import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { groupAdminAuth } from "../../middleware/auth.middleware";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import groupExists from "../../middleware/groupExists.middleware";
import UpdateMeasurementDto from "./measurementUpdate.dto";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import {
	deleteMeasurement,
	deleteMeasurementsBeforeDate,
	getDuringMeasurementsWithPagination,
	getLastMeasurements,
	getMeasurement,
	getTotalRowsDuringMeasurements,
	updateMeasurement
} from "./measurementDAL";
import HttpException from "../../exceptions/HttpException";
import DeleteMeasurementDto from "./measurementDelete.dto";
import MeasurementsWithPaginationDto from "./measurementsWithPagination";
import DeleteMeasurementsBeforeDateDto from "./deleteMeasurementsBeforeDate.dto";

class MeasurementController implements IController {
	public path = "/measurement";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}/:groupId/:topic/:timestamp`,
				groupExists,
				groupAdminAuth,
				this.getMeasurement
			)
			.get(
				`${this.path}s_last/:groupId/:topic/:count`,
				groupExists,
				groupAdminAuth,
				this.getLastMeasurements
			)
			.post(
				`${this.path}s_pagination/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<MeasurementsWithPaginationDto>(MeasurementsWithPaginationDto),
				this.getMeasurementsWithPagination
			)
			.patch(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<UpdateMeasurementDto>(UpdateMeasurementDto),
				this.updateMeasurement
			)
			.delete(
				`${this.path}/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<DeleteMeasurementDto>(DeleteMeasurementDto),
				this.deleteMeasurement
			)
			.delete(
				`${this.path}s_before_date/:groupId`,
				groupExists,
				groupAdminAuth,
				validationMiddleware<DeleteMeasurementsBeforeDateDto>(DeleteMeasurementsBeforeDateDto),
				this.deleteMeasurementsBeforeDate
			)

	}


	private getMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const groupUid = req.group.groupUid;
			const { topic, timestamp } = req.params;
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
			const topic = req.params.topic;
			const count = parseInt(req.params.count, 10);
			const measurement = await getLastMeasurements(groupUid, topic, count);
			res.status(200).send(measurement);
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

	private updateMeasurement = async (
		req: IRequestWithGroup,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const {topic, timestamp, updatedPayload} = req.body;
			const groupUid = req.group.groupUid;
			const existMeasurement = await getMeasurement(groupUid, topic, timestamp);
			if (!existMeasurement) throw new ItemNotFoundException("The measurement", "timestamp", timestamp);
			let newPayload = existMeasurement.payload;
			if (JSON.stringify(existMeasurement.payload) !== JSON.stringify(updatedPayload)) {
				newPayload = updatedPayload;
			}
			const response = await updateMeasurement(groupUid, topic, timestamp, newPayload);
			if (!response) throw new HttpException(500, "The measurement could not be updated");
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
			if (!existMeasurement) throw new ItemNotFoundException("The measurement", "timestamp", timestamp);
			const response = await deleteMeasurement(groupUid, topic, timestamp);
			if (!response) throw new HttpException(500, "Any measurement has been deleted");
			const message = { message: `Measurement deleted succesfully` }
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
			if (!response) throw new HttpException(500, "Any measurement has been deleted");
			const message = { message: `Measurements deleted succesfully` }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};
}

export default MeasurementController;