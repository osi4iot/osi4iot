import { Request } from "express";
import IMLModel from "./ml_model.interface";
import IGroup from "../group/interfaces/Group.interface";

interface IRequestWithMLModelAndGroup extends Request {
	mlModel: IMLModel;
	group: IGroup;
}

export default IRequestWithMLModelAndGroup;