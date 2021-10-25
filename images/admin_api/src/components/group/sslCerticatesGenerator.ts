import fs from "fs";
import mkcert from "mkcert";
import process_env from "../../config/api_config";
import IGroup from "./interfaces/Group.interface";
import ISSLCertificates from "./interfaces/ISSLCertificates";

const sslCerticatesGenerator = async (group: IGroup): Promise<ISSLCertificates> => {

	const ca_crt = fs.readFileSync("/run/secrets/ca.crt");
	const ca_key = fs.readFileSync("/run/secrets/ca.key");
	const validityDays = parseInt(process_env.MQTT_SSL_CERTS_VALIDITY_DAYS,10);

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