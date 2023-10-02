export interface LoggedUser {
	id: string;
	firstName: string;
	surname: string;
	email: string;
}

export interface ChildrenProp {}

export interface SensorOptions {
	frequency: number;
	referenceFrame: string;
}

declare global {
	class Accelerometer {
		x: number;
		y: number;
		z: number;
		constructor(options: SensorOptions);
		start(): void;
		onreading: () => void;
		stop(): void;
	}

	class LinearAccelerationSensor {
		x: number;
		y: number;
		z: number;
		constructor(options: SensorOptions);
		start(): void;
		onreading: () => void;
		stop(): void;
	}

	class AbsoluteOrientationSensor {
		quaternion: number[];
		constructor(options: SensorOptions);
		start(): void;
		onreading: () => void;
		stop(): void;
	}

	class GravitySensor {
		x: number;
		y: number;
		z: number;
		constructor(options: SensorOptions);
		start(): void;
		onreading: () => void;
		stop(): void;
	}
}
