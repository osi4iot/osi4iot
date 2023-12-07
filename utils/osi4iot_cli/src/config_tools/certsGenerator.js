import mkcert from 'mkcert';
import fs from 'fs';
import md5 from 'md5';
import { execSync } from 'child_process';
import { giveCountryCode } from '../generic_tools/countryCodes.js';
import acmeCerts from './acmeCerts.js';

export default async function (osi4iotState) {
	const currentTimestamp = Math.floor(Date.now() / 1000);
	const limitTimestamp = currentTimestamp + 3600 * 24 * 15; //15 days in sec of margin
	const defaultValidityDays = osi4iotState.platformInfo.MQTT_SSL_CERTS_VALIDITY_DAYS;
	const defaultExpirationTimestamp = currentTimestamp + 3600 * 24 * defaultValidityDays;

	const certs_dir = "./certs"
	if (!fs.existsSync(certs_dir)) {
		fs.mkdirSync(certs_dir);

		const domain_certs_dir = "./certs/domain_certs"
		if (!fs.existsSync(domain_certs_dir)) {
			fs.mkdirSync(domain_certs_dir);
		}

		const mqtt_certs_dir = "./certs/mqtt_certs"
		if (!fs.existsSync(mqtt_certs_dir)) {
			fs.mkdirSync(mqtt_certs_dir);

			const ca_certs_dir = "./certs/mqtt_certs/ca_certs";
			fs.mkdirSync(ca_certs_dir);

			const broker_dir = "./certs/mqtt_certs/broker";
			fs.mkdirSync(broker_dir);
		}
	}

	if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
		acmeCerts(osi4iotState);
	}

	const domainCertsType = osi4iotState.platformInfo.DOMAIN_CERTS_TYPE;
	if (domainCertsType === "Certs provided by an CA" || domainCertsType === "Let's encrypt certs and AWS Route 53") {
		const iot_platform_key_name = `iot_platform_key_${md5(osi4iotState.certs.domain_certs.private_key)}`;
		const current_iot_platform_key_name = osi4iotState.certs.domain_certs.iot_platform_key_name;
		if (!fs.existsSync('./certs/domain_certs/iot_platform.key') || current_iot_platform_key_name !== iot_platform_key_name) {
			fs.writeFileSync('./certs/domain_certs/iot_platform.key', osi4iotState.certs.domain_certs.private_key);
			osi4iotState.certs.domain_certs.iot_platform_key_name = iot_platform_key_name;
		}

		const iot_platform_ca_name = `iot_platform_ca_${md5(osi4iotState.certs.domain_certs.ssl_ca_pem)}`;
		const current_iot_platform_ca_name = osi4iotState.certs.domain_certs.iot_platform_ca_name;
		if (!fs.existsSync('./certs/domain_certs/iot_platform_ca.pem') || current_iot_platform_ca_name !== iot_platform_ca_name) {
			fs.writeFileSync('./certs/domain_certs/iot_platform_ca.pem', osi4iotState.certs.domain_certs.ssl_ca_pem);
			const iotPlatformCa = execSync('openssl x509 -enddate -noout -in ./certs/domain_certs/iot_platform_ca.pem');
			const iotPlatformCaExpDate = iotPlatformCa.toString().split("=")[1];
			const iotPlatformCaExpTimestamp = Date.parse(iotPlatformCaExpDate) / 1000;
			osi4iotState.certs.domain_certs.ca_pem_expiration_timestamp = iotPlatformCaExpTimestamp;
			osi4iotState.certs.domain_certs.iot_platform_ca_name = iot_platform_ca_name;
		}

		const iot_platform_cert_name = `iot_platform_cert_${md5(osi4iotState.certs.domain_certs.ssl_cert_crt)}`;
		const current_iot_platform_cert_name = osi4iotState.certs.domain_certs.iot_platform_cert_name;
		if (!fs.existsSync('./certs/domain_certs/iot_platform_cert.cer') || current_iot_platform_cert_name !== iot_platform_cert_name) {
			fs.writeFileSync('./certs/domain_certs/iot_platform_cert.cer', osi4iotState.certs.domain_certs.ssl_cert_crt);
			const iotPlatformCert = execSync('openssl x509 -enddate -noout -in ./certs/domain_certs/iot_platform_cert.cer');
			const iotPlatformCertExpDate = iotPlatformCert.toString().split("=")[1];
			const iotPlatformCertExpTimestamp = Date.parse(iotPlatformCertExpDate) / 1000;
			osi4iotState.certs.domain_certs.cert_crt_expiration_timestamp = iotPlatformCertExpTimestamp;
			osi4iotState.certs.domain_certs.iot_platform_cert_name = iot_platform_cert_name;
		}
	}

	let mqttCa = {
		key: osi4iotState.certs.mqtt_certs.ca_certs.ca_key,
		cert: osi4iotState.certs.mqtt_certs.ca_certs.ca_crt
	};

	if ((mqttCa.key === "" && mqttCa.cert === "") || parseInt(osi4iotState.certs.mqtt_certs.ca_certs.expiration_timestamp, 10) < limitTimestamp) {
		// create a certificate authority
		mqttCa = await mkcert.createCA({
			organization: osi4iotState.platformInfo.MAIN_ORGANIZATION_ACRONYM.toUpperCase(),
			countryCode: giveCountryCode(osi4iotState.platformInfo.MAIN_ORGANIZATION_COUNTRY),
			state: osi4iotState.platformInfo.MAIN_ORGANIZATION_STATE,
			locality: osi4iotState.platformInfo.MAIN_ORGANIZATION_CITY,
			validityDays: 3650
		});
		const expiration_timestamp = currentTimestamp + 3600 * 24 * 3650; //10 years in sec of margin
		osi4iotState.certs.mqtt_certs.ca_certs.ca_key = mqttCa.key;
		osi4iotState.certs.mqtt_certs.ca_certs.mqtt_certs_ca_cert_name = `mqtt_certs_ca_cert_${md5(mqttCa.key)}`;
		osi4iotState.certs.mqtt_certs.ca_certs.ca_crt = mqttCa.cert;
		osi4iotState.certs.mqtt_certs.ca_certs.mqtt_certs_ca_key_name = `mqtt_certs_ca_key_${md5(mqttCa.cert)}`;
		osi4iotState.certs.mqtt_certs.ca_certs.expiration_timestamp = expiration_timestamp;

		fs.writeFileSync('./certs/mqtt_certs/ca_certs/ca.key', mqttCa.key);

		fs.writeFileSync('./certs/mqtt_certs/ca_certs/ca.crt', mqttCa.cert);
	}

	const broker_server_crt = osi4iotState.certs.mqtt_certs.broker.server_crt;
	const broker_server_key = osi4iotState.certs.mqtt_certs.broker.server_key;
	const broker_expiration_timestamp = osi4iotState.certs.mqtt_certs.broker.expiration_timestamp;
	if ((broker_server_crt === "" && broker_server_key === "") || broker_expiration_timestamp < limitTimestamp) {
		const broker = await mkcert.createCert({
			domains: [osi4iotState.platformInfo.DOMAIN_NAME],
			validityDays: defaultValidityDays,
			caKey: mqttCa.key,
			caCert: mqttCa.cert
		});
		osi4iotState.certs.mqtt_certs.broker.server_crt = broker.cert;
		osi4iotState.certs.mqtt_certs.broker.mqtt_broker_cert_name = `mqtt_broker_cert_${md5(broker.cert)}`;
		osi4iotState.certs.mqtt_certs.broker.server_key = broker.key;
		osi4iotState.certs.mqtt_certs.broker.mqtt_broker_key_name = `mqtt_broker_key_${md5(broker.key)}`;
		osi4iotState.certs.mqtt_certs.broker.expiration_timestamp = defaultExpirationTimestamp;

		fs.writeFileSync('./certs/mqtt_certs/broker/server.key', broker.key);

		fs.writeFileSync('./certs/mqtt_certs/broker/server.crt', broker.cert);
	}

	const nodeRedInstanceCertsPromises = []
	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const num_nodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
		for (let idev = 1; idev <= num_nodeRedInstances; idev++) {
			const nri_client_crt = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_crt;
			const nri_client_key = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_key;
			const nri_exp_timestamp = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].expiration_timestamp;
			const nri_hash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].nri_hash;

			if ((nri_client_crt === "" && nri_client_key === "") || nri_exp_timestamp < limitTimestamp) {
				const promise = mkcert.createCert({
					domains: [`nri_${nri_hash}`],
					validityDays: defaultValidityDays,
					caKey: mqttCa.key,
					caCert: mqttCa.cert
				});

				nodeRedInstanceCertsPromises.push(promise);
			}

		}
	}

	const nodeRedInstanceCerts = await Promise.all(nodeRedInstanceCertsPromises).catch(err => console.log("Error in node-red instance certs ", err));

	let counter = 0;
	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const num_nodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
		const org_acronym = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_acronym;
		for (let idev = 1; idev <= num_nodeRedInstances; idev++) {
			const nri_client_crt = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_crt;
			const nri_client_key = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_key;
			const nri_exp_timestamp = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].expiration_timestamp;
			const nri_hash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].nri_hash;

			if ((nri_client_crt === "" && nri_client_key === "") || nri_exp_timestamp < limitTimestamp) {
				const nodeRedInstanceCertsDir = `./certs/mqtt_certs/org_${org_acronym}_nri_${nri_hash}`;
				if (!fs.existsSync(nodeRedInstanceCertsDir)) {
					fs.mkdirSync(nodeRedInstanceCertsDir);
				}

				const nodeRedInstanceClientKey = `./certs/mqtt_certs/org_${org_acronym}_nri_${nri_hash}/client.key`;
				fs.writeFileSync(nodeRedInstanceClientKey, nodeRedInstanceCerts[counter].key);
				osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_key = nodeRedInstanceCerts[counter].key;
				osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_key_name = `${org_acronym}_${nri_hash}_key_${md5(nodeRedInstanceCerts[counter].key)}`

				const nodeRedInstanceClientCert = `./certs/mqtt_certs/org_${org_acronym}_nri_${nri_hash}/client.crt`;
				fs.writeFileSync(nodeRedInstanceClientCert, nodeRedInstanceCerts[counter].cert);
				osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_crt = nodeRedInstanceCerts[counter].cert;
				osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].client_crt_name = `${org_acronym}_${nri_hash}_cert_${md5(nodeRedInstanceCerts[counter].cert)}`

				osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].expiration_timestamp = defaultExpirationTimestamp;
				counter++;
			}
		}
	}
};