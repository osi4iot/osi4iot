export default interface IMeasurement {
	timestamp: string;
	topic: string;
	payload: string;
	totalRows?: number;
}