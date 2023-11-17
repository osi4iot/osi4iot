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
	defaultPayloadJsonSchema: string;
	dashboardRefreshString: string;
	dashboardTimeWindow: string;
	created?: string;
	updated?: string;
}
