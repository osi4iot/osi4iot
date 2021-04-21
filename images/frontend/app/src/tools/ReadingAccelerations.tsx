import Paho from "paho-mqtt";

const ReadAccelerations = (
	mqttClient: Paho.Client,
	mqttTopic: string,
	readingParameter: any,
	setIsSensorReadings: React.Dispatch<React.SetStateAction<boolean>>,
	setReadingProgress: React.Dispatch<React.SetStateAction<number>>
) => {
	let readingsCont = 0;
	const deltaT = 1.0 / readingParameter.samplingFrequency;
	const totalReadings = readingParameter.totalReadingTime / deltaT;

	const sensor = new Accelerometer({ frequency: readingParameter.samplingFrequency, referenceFrame: "device" });
	sensor.start();
	sensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsCont <= totalReadings) {
			let az = sensor.z - 9.80665;
			const payload = { ax: sensor.x, ay: sensor.y, az };
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
