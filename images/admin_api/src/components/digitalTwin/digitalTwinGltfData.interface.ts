import { ISlideModelInfo } from "./slideModels";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSensorDashboard from "./digitalTwinSensorDashboard.interface";

export interface IMqttTopicData {
	topicId: number;
	topicRef: string;
	mqttTopic: string;
	groupUid: string | null;
	sqlTopic: string | null;
	lastMeasurement: IMeasurement | null;
}

export interface IMqttTopicDataShort {
	topicId: number;
	topicRef: string;
	mqttTopic: string;
	lastMeasurement: IMeasurement | null;
}

export interface IDigitalTwinData {
	id?: number;
	// the context of its asset: "asset" (a real one), "group" (a group's control room), "organization" (the overview)
	assetContext?: string;
	digitalTwinSimulationFormat: string;
	// the 3D model of each slide that has one (slideModels.ts)
	slideModels?: Record<string, ISlideModelInfo>;
	mqttTopicsData: IMqttTopicDataShort[];
	topicIdBySensorRef: Record<string, number>;
	sensorsDashboards: IDigitalTwinSensorDashboard[];
}