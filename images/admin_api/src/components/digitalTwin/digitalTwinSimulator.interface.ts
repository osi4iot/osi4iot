export default interface IDigitalTwinSimulator {
	id: number;
	orgAcronym: string;
	groupAcronym: string;
	groupId: string;
	assetUid: string;
	assetDescription: string;
	digitalTwinUid: string;
	digitalTwinDescription: string;
	description: string;
	digitalTwinSimulationFormat: string;
	sensorSimulationTopicId: number;
	mqttTopic?: string;
}