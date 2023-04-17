import Paho from "paho-mqtt";

const ReadAccelerations = (
	mqttClient: Paho.Client,
	mqttTopic: string,
	totalReadingTime: number,
	samplingFrequency: number,
	setIsSensorReadings: React.Dispatch<React.SetStateAction<boolean>>,
	setReadingProgress: React.Dispatch<React.SetStateAction<number>>
) => {
	let readingsCont = 0;
	const deltaT = 1.0 / samplingFrequency;
	const totalReadings = totalReadingTime / deltaT;
	let gravity: number[] = [];
	let readingsGravityCont = 0;

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

	const sensor = new Accelerometer({ frequency: samplingFrequency, referenceFrame: "device" });
	sensor.start();
	sensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsCont <= totalReadings) {
			if (gravity.length !== 0) {
				const timestamp = (new Date()).toJSON();
				const accelerations = [
					sensor.x - gravity[0],
					sensor.y - gravity[1],
					sensor.z - gravity[2]
				]
				const payload = { timestamp, accelerations };
				const message = new Paho.Message(JSON.stringify(payload));
				message.destinationName = mqttTopic;
				mqttClient.send(message);
			}
			const readingProgress = (readingsCont / totalReadings) * 100;
			setReadingProgress(readingProgress);
			readingsCont++;
		} else {
			sensor.stop();
			setIsSensorReadings(false);
		}
	};

	return [gravitySensor, sensor];
};

export default ReadAccelerations;
