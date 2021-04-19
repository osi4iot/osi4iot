import Paho from "paho-mqtt";

const ReadAccelerations = (mqttClient: Paho.Client, mqttTopic: string, readingParameter: any) => {
  let readingsCont = 0;
  const deltaT = 1.0 / readingParameter.samplingFrequency;
  const totalReadings = readingParameter.totalReadingTime / deltaT;

  const sensor = new Accelerometer({ frequency: readingParameter.samplingFrequency, referenceFrame: "device" });
  console.log("Paso por aqui=", sensor);
  sensor.start();
  sensor.onreading = function () {
    if (readingsCont <= totalReadings) {
      let az = sensor.z - 9.81;
      const payload = { ax: sensor.x, ay: sensor.y, az };
      const message = new Paho.Message(JSON.stringify(payload));
      message.destinationName = mqttTopic;
      mqttClient.send(message);
      readingsCont++;
    } else {
      sensor.stop();
    }
  };
};

export default ReadAccelerations;