export default interface IDigitalTwinSimulator {
	id: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	digitalTwinUid: string;
	description: string;
	digitalTwinSimulationFormat: string;
	sensorSimulationTopicId: number;
	mqttTopic?: string;
}