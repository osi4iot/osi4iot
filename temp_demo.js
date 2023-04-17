require("dotenv").config();
const config = require("./config");
const ds18b20 = require("ds18b20");
const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");
const needle = require("needle");
const express = require('express');
const app = express();

var initTime = 0.0;
const maxTime = 3600 * 6;
const frequency = 1.0 / maxTime;
const intervalTime = 1000;

let sensorDS18B20Id_array;
ds18b20.sensors(function (err, id) {
    sensorDS18B20Id_array = id;
    console.log("Sensor Ids: ", sensorDS18B20Id_array);
});


const mqttOptions = {
    port: config.port,
    host: config.host,
    protocol: "mqtt",
    username: config.userLogin,
    password: config.userPassword
};

const client = mqtt.connect(mqttOptions);

var interval;

client.on("connect", async function () {
    // When connected
    if (client.connected) console.log("Connected for subcrition and publish");

    try {
        const deviceInfo = await getDeviceInformation();
        const topicInfo = await getTopicInformation();
        const GroupHash = `Group_${deviceInfo.groupUid}`;
        const DeviceHash = `Device_${deviceInfo.deviceUid}`;
        const TopicHash = `Topic_${topicInfo.topicUid}`;

        interval = setInterval(() => {
            var currentTime = new Date();
            if (initTime == 0.0) {
                initTime = new Date();
            }
            var time = (currentTime - initTime) / 1000.0;
            console.log("time:", time);
            if (time <= maxTime) {
                var temp_obj = readDS18B20();
                var tempReaded = parseFloat(temp_obj.tempReaded);
                var data2Send = {
                    temperature: tempReaded,
                };

                const topic = `dev2pdb/${GroupHash}/${DeviceHash}/${TopicHash}`;
                client.publish(topic, JSON.stringify(data2Send), { qos: 2 }, function () {
                    console.log("Message published: ", data2Send);
                });
            } else EndProcess();
        }, intervalTime);
    } catch (error) {
        console.error(error);
    }
});

function readDS18B20() {
    if (sensorDS18B20Id_array === undefined) throw new Error("Sensors not detected");
    var tempReaded = ds18b20.temperatureSync(sensorDS18B20Id_array[0]).toFixed(1);
    var temp_obj = { tempReaded: tempReaded };
    return temp_obj;
}

async function getDeviceInformation() {
    const url = `https://${config.host}/admin_api/device_information/${config.groupId}/${config.deviceId}`;
    options = {
        rejectUnauthorized: false,
        json: true,
    };
    const userData = {
        emailOrLogin: config.userLogin,
        password: config.userPassword,
    };

    const device = await needle("post", url, userData, options)
        .then((res) => res.body)
        .catch((err) => console.log("error", "Device information could not be obtained: %s", err.message));
    return device;
}

async function getTopicInformation() {
    const url = `https://${config.host}/admin_api/topic_information/${config.groupId}/${config.topicId}`;
    options = {
        rejectUnauthorized: false,
        json: true,
    };
    const userData = {
        emailOrLogin: config.userLogin,
        password: config.userPassword,
    };

    const topic = await needle("post", url, userData, options)
        .then((res) => res.body)
        .catch((err) => console.log("error", "Topic information could not be obtained: %s", err.message));
    return topic;
}

function EndProcess() {
    console.log("Proceso finalizado");
    clearInterval(interval);
    process.exit();
}

process.on("SIGINT", () => {
    clearInterval(interval);
    process.exit();
});

app.get('/', (req, res) => {
    res.end(`Hello PID: ${process.pid}`);
});

app.get('/health', (req, res) => {
    console.log('Health Check Request');
    res.status(200).end();
});

app.listen(3000, function () {
    console.log(`Api Server running on port 3000, PID: ${process.pid}`);
});
