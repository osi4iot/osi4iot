import IMeasurement from "../mesurement/measurement.interface";

export interface IMqttTopicData {
	topicId: number;
	mqttTopic: string;
	groupUid: string | null;
	sqlTopic: string | null;
	lastMeasurement: IMeasurement | null;
}

export default interface IDigitalTwinGltfData {
	id?: number;
	gltfData: string;
	femSimulationData: string;
	mqttTopics: string[];
	lastMeasurements: (IMeasurement | null) [];
}