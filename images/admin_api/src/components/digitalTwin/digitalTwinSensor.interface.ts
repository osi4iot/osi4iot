export default interface IDigitalTwinSensor {
	digitalTwinId: number;
	sensorId: number;
	topicId: number;
	sensorRef: string;
	alreadyCreated: boolean;
}