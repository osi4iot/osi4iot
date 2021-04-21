import Paho, { MQTTError } from "paho-mqtt";

const MqttConnection = (setIsMqttConnected: React.Dispatch<React.SetStateAction<boolean>>): Paho.Client => {
	const platformLocation = window.location.href;
	let domainName = platformLocation.split("/")[2];
	if (domainName === "localhost:3000") domainName = "localhost"; //Development case

	function onConnect() {
		setIsMqttConnected(true);
	}

	function onConnectionLost(error: MQTTError) {
        if (error.errorCode !== 0) {
            setIsMqttConnected(false);
			console.log("onConnectionLost:" + error.errorMessage);
		}
	}

	function onFailure(error: any) {
		console.log("Connecton failed: ", error);
	}

	// called when a message arrives
	function onMessageArrived(message: any) {
		console.log("onMessageArrived:" + message.payloadString);
	}

	const port = 9001;
	const clientId = "clientId_" + Math.floor(Math.random() * 1000);
	const client = new Paho.Client(domainName, port, clientId);

	// set callback handlers
	client.onConnectionLost = onConnectionLost;
	client.onMessageArrived = onMessageArrived;

	// // connect the client
	client.connect({
		useSSL: true,
		timeout: 3,
		onSuccess: onConnect,
		onFailure: onFailure,
    });
    
    return client;
};

export default MqttConnection;
