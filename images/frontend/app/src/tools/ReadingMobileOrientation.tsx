import Paho from "paho-mqtt";

const ReadMobileOrientation = (
	mqttClient: Paho.Client,
	mqttTopic: string,
	totalReadingTime: number,
	samplingFrequency: number,
	setIsSensorReadings: React.Dispatch<React.SetStateAction<boolean>>,
	setReadingProgress: React.Dispatch<React.SetStateAction<number>>
) => {
	let readingsQuaternionCont = 0;
	const deltaT = 1.0 / samplingFrequency;
	const totalReadings = totalReadingTime / deltaT;;

	const quaternionSensor = new AbsoluteOrientationSensor({ frequency: samplingFrequency, referenceFrame: "device" });
	quaternionSensor.start();
	quaternionSensor.onreading = function () {
		setIsSensorReadings(true);
		if (readingsQuaternionCont <= totalReadings) {
			const mobile_quaternion = [
				quaternionSensor.quaternion[0],
				quaternionSensor.quaternion[1],
				quaternionSensor.quaternion[2],
				quaternionSensor.quaternion[3]
			];

			const timestamp = (new Date()).toJSON();
			const payload = {
				timestamp,
				mobile_quaternion
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

};

export default ReadMobileOrientation;
