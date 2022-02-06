import IMeasurement from "../mesurement/measurement.interface";

export interface IMqttTopicData {
	topicId: number;
	topicType: string;
	topicSubtype: string;
	mqttTopic: string;
	groupUid: string | null;
	sqlTopic: string | null;
	lastMeasurement: IMeasurement | null;
}

interface IMqttTopicDataShort {
	topicId: number;
	topicType: string;
	topicSubtype: string;
	mqttTopic: string;
	lastMeasurement: IMeasurement | null;
}

export default interface IDigitalTwinGltfData {
	id?: number;
	gltfData: string;
	femSimulationData: string;
	sensorSimulationTopicId: number;
	assetStateTopicId: number;
	assetStateSimulationTopicId: number;
	femResultModalValuesTopicId: number;
	femResultModalValuesSimulationTopicId: number;
	mqttTopicsData: IMqttTopicDataShort[];
}