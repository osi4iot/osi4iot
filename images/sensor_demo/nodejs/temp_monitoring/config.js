module.exports = {
	host: process.env.MQTT_HOST,
	clientId: "RPI_1",
	port: 8883, //1883 or 8883
	groupId: process.env.GROUP_ID,
	deviceId: process.env.DEVICE_ID,
	topicId:  process.env.TOPIC_ID,
	userLogin: process.env.USER_LOGIN,
	userPassword: process.env.USER_PASSWORD,
};
