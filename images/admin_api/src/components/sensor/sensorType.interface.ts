export default interface ISensorType {
	id?: number;
	orgId?: number;
	sensorTypeUid: string;
	type: string;
	iconSvgFileName: string;
	iconSvgString: string;
	isPredefined: boolean;
	defaultMeasurements: string;
	dashboardRefreshString: string;
	dashboardTimeWindow: string;
	created?: string;
	updated?: string;
}
