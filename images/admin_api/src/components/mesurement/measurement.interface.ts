export default interface IMeasurement {
	timestamp: number;
	topic: string;
	payload: string;
	totalRows?: number;
}