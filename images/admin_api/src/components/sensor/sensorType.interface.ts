export default interface ISensorType {
	id?: number;
	orgId?: number;
	sensorTypeUid: string;
	type: string;
	iconSvgFileName: string;
	iconSvgString: string;
	markerSvgFileName: string;
	markerSvgString: string;
	isPredefined: boolean;
	payloadJsonSchema: string;
	created?: string;
	updated?: string;
}
