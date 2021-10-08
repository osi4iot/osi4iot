import fs from "fs";
import mkcert from "mkcert";
import IGroup from "./interfaces/Group.interface";
import ISSLCertificates from "./interfaces/ISSLCertificates";

const sslCerticatesGenerator = async (group: IGroup): Promise<ISSLCertificates> => {

	const ca_crt = fs.readFileSync("./mqtt_certs/ca.crt");
	const ca_key = fs.readFileSync("./mqtt_certs/ca.key");
	const validityDays = parseInt(process.env.MQTT_SSL_CERTS_VALIDITY_DAYS,10);

	const ca_certs = {
		key: ca_key.toString(),
		cert: ca_crt.toString(),
	};

	const groupId = `group_${group.id}`;

	const clientCerts = await mkcert.createCert({
		domains: [groupId],
		validityDays,
		caKey: ca_certs.key,
		caCert: ca_certs.cert,
	});

	const certs = {
		caCert: ca_certs.cert,
		clientCert: clientCerts.cert,
		clientKey: clientCerts.key,
		validityDays
	}

	return certs;
}

export default sslCerticatesGenerator;