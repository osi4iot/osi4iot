export default interface IDigitalTwinSimulator {
	id: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	name: string;
	description: string;
	digitalTwinSimulationFormat: string;
	sensorSimulationTopicId: number;
	mqttTopic: string;
}