module.exports = {
	host: process.env.MQTT_HOST, // process.env.MQTT_HOST, '192.168.1.41', '147.83.143.71', '10.5.49.99',//Here it is used the server IP
	clientId: "RPI_1",
	port: 8883, //1883 or 8883
	groupId: process.env.GROUP_ID,
	deviceId: process.env.DEVICE_ID,
	userLogin: process.env.USER_LOGIN,
	userPassword: process.env.USER_PASSWORD,
};
