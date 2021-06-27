export interface LoggedUser {
	id: string;
	firstName: string;
	surname: string;
	email: string;
}

export interface ChildrenProp {}

export interface IDevice {
	id: number;
	orgId: number;
	groupId: number;
	name: string;
	description: string;
	type: string;
	groupUid: string;
	deviceUid: string;
	longitude: number;
	latitude: number;
	created: string;
	updated: string;
}

export interface AccelerometerOptions {
	frequency: number;
	referenceFrame: string;
}

declare global {
	class Accelerometer {
		x: number;
		y: number;
		z: number;
		constructor(options: AccelerometerOptions);
		start(): void;
		onreading: () => void;
		stop(): void;
	}
}
