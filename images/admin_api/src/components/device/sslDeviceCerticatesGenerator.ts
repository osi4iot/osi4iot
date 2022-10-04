import fs from "fs";
import mkcert from "mkcert";
import { nanoid } from "nanoid";
import process_env from "../../config/api_config";
import IDevice from "./device.interface";
import { updateMqttPasswordOfDeviceById } from "./deviceDAL";
import ISSLCertificates from "./ISSLCertificates";

const sslDeviceCerticatesGenerator = async (device: IDevice): Promise<ISSLCertificates> => {

	const ca_crt = fs.readFileSync("/run/secrets/ca.crt");
	const ca_key = fs.readFileSync("/run/secrets/ca.key");
	const validityDays = parseInt(process_env.MQTT_SSL_CERTS_VALIDITY_DAYS,10);

	const ca_certs = {
		key: ca_key.toString(),
		cert: ca_crt.toString(),
	};

	const username = `device_${device.id}`;
	const mqttPassword = nanoid(16).replace(/-/g, "x").replace(/_/g, "X");
	await updateMqttPasswordOfDeviceById(device, mqttPassword);

	const clientCerts = await mkcert.createCert({
		domains: [username],
		validityDays,
		caKey: ca_certs.key,
		caCert: ca_certs.cert,
	});

	const certs = {
		username,
		password: mqttPassword,
		caCert: ca_certs.cert,
		clientCert: clientCerts.cert,
		clientKey: clientCerts.key,
		validityDays
	}

	return certs;
}

export default sslDeviceCerticatesGenerator;