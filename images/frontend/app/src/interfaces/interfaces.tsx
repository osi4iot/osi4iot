export interface LoggedUser {
	id: string;
	firstName: string;
	surname: string;
	email: string;
}

export interface AuthContextProps {
	accessToken: string;
	refreshToken: string;
	expirationDate: string;
	loading: boolean;
	errorMessage: string | null;
}

export interface ActionPayload {
	accessToken: string;
	refreshToken: string;
}

export interface Action {
	type: string;
	payload: ActionPayload;
	error: string;
}

export interface ChildrenProp {}

export interface LoginData {
	emailOrLogin: string;
	password: string;
}

export interface AuthDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface IDevice {
	id: number;
	orgId: number;
	groupId: number;
	name: string;
	description: string;
	isDefaultGroupDevice: boolean;
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
