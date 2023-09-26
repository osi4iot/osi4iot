import { Request } from "express";
import IDigitalTwin from "../../digitalTwin/digitalTwin.interface";
import IGroup from "./Group.interface";

interface IRequestWithDigitalTwinAndGroup extends Request {
	digitalTwin: IDigitalTwin;
	group: IGroup;
}

export default IRequestWithDigitalTwinAndGroup;