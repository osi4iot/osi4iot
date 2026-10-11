import { NatsConnection, headers } from "nats.ws";
import { sc } from "./Natsconnection";

const ReadMobileOrientation = (
	nc: NatsConnection,
	natsSubject: string,
	totalReadingTime: number,
	samplingFrequency: number,
	setIsSensorReadings: React.Dispatch<React.SetStateAction<boolean>>,
	setReadingProgress: React.Dispatch<React.SetStateAction<number>>
) => {
	let readingsQuaternionCont = 0;
	const deltaT = 1.0 / samplingFrequency;
	const totalReadings = totalReadingTime / deltaT;

	const h = headers();
	h.set("Content-Type", "application/json");
	h.set("Json-Structure", "object");

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
			const payload = { timestamp, mobile_quaternion };
			nc.publish(natsSubject, sc.encode(JSON.stringify(payload)), { headers: h });

			const readingProgress = (readingsQuaternionCont / totalReadings) * 100;
			setReadingProgress(readingProgress);
			readingsQuaternionCont++;
		} else {
			quaternionSensor.stop();
			setIsSensorReadings(false);
		}
	};

	return quaternionSensor;
};

export default ReadMobileOrientation;