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

	const sensor = new Accelerometer({ frequency: samplingFrequency, referenceFrame: "device" });
	sensor.start();
	sensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsCont <= totalReadings) {
			const timestamp = (new Date()).toJSON();
			let az = sensor.z - 9.80665;
			const payload = { timestamp, accelerations: [sensor.x, sensor.y, az] };
			const message = new Paho.Message(JSON.stringify(payload));
			message.destinationName = mqttTopic;
			mqttClient.send(message);
			const readingProgress = (readingsCont / totalReadings) * 100;
			setReadingProgress(readingProgress);
			readingsCont++;
		} else {
			sensor.stop();
			setIsSensorReadings(false);
		}
	};
};

export default ReadAccelerations;
