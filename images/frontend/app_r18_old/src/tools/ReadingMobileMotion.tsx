import Paho from "paho-mqtt";

const ReadMobileMotion = (
	mqttClient: Paho.Client,
	mqttTopic: string,
	totalReadingTime: number,
	samplingFrequency: number,
	setIsSensorReadings: React.Dispatch<React.SetStateAction<boolean>>,
	setReadingProgress: React.Dispatch<React.SetStateAction<number>>
) => {
    const deltaT = 1.0 / samplingFrequency;
	const totalReadings = totalReadingTime / deltaT;
    let gravity: number[] = [];
    let accelerations: number[] = [];
	let readingsAccelerationCont = 0;
    let readingsGravityCont = 0;
    let readingsQuaternionCont = 0;

	const gravitySensor = new GravitySensor({ frequency: samplingFrequency, referenceFrame: "device" });
	gravitySensor.start();
	gravitySensor.onreading = function () {
		if (readingsGravityCont <= totalReadings) {
			gravity[0] = gravitySensor.x;
			gravity[1] = gravitySensor.y;
			gravity[2] = gravitySensor.z;
			readingsGravityCont++;
		} else {
			gravitySensor.stop();
		}
	};

	const accelerationSensor = new Accelerometer({ frequency: samplingFrequency, referenceFrame: "device" });
	accelerationSensor.start();
	accelerationSensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsAccelerationCont <= totalReadings) {
			if (gravity.length !== 0) {
				accelerations = [
					accelerationSensor.x - gravity[0],
					accelerationSensor.y - gravity[1],
					accelerationSensor.z - gravity[2]
                ]
                readingsAccelerationCont++;
			}
		} else {
			accelerationSensor.stop();
		}
    };
    
    const quaternionSensor = new AbsoluteOrientationSensor({ frequency: samplingFrequency, referenceFrame: "device" });
	quaternionSensor.start();
	quaternionSensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsQuaternionCont <= totalReadings) {
            const mobile_motion = [
                accelerations[0],
                accelerations[1],
                accelerations[2],
				quaternionSensor.quaternion[0],
				quaternionSensor.quaternion[1],
				quaternionSensor.quaternion[2],
				quaternionSensor.quaternion[3]
			];

			const timestamp = (new Date()).toJSON();
			const payload = {
				timestamp,
				mobile_motion
			};
			const message = new Paho.Message(JSON.stringify(payload));
			message.destinationName = mqttTopic;
			mqttClient.send(message);
			const readingProgress = (readingsQuaternionCont / totalReadings) * 100;
			setReadingProgress(readingProgress);
			readingsQuaternionCont++;
		} else {
			quaternionSensor.stop();
			setIsSensorReadings(false);
		}
	};

	return [gravitySensor, accelerationSensor, quaternionSensor];
};

export default ReadMobileMotion;
