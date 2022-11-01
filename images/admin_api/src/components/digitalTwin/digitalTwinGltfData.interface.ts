import IMeasurement from "../mesurement/measurement.interface";

export interface IMqttTopicData {
	topicId: number;
	topicType: string;
	mqttTopic: string;
	groupUid: string | null;
	sqlTopic: string | null;
	lastMeasurement: IMeasurement | null;
}

export interface IMqttTopicDataShort {
	topicId: number;
	topicType: string;
	mqttTopic: string;
	lastMeasurement: IMeasurement | null;
}

export default interface IDigitalTwinGltfData {
	id?: number;
	gltfData: string;
	femSimulationData: string;
	digitalTwinSimulationFormat: string;
	mqttTopicsData: IMqttTopicDataShort[];
}