import fs from 'fs';
import md5 from 'md5';

export default function (osi4iotState) {
	const currentTimestamp = Math.floor(Date.now() / 1000);
	const limitTimestamp = currentTimestamp - 3600 * 24 * 15; //15 days of margin

	let certsUpdateIsNeedeed = false;

	if (osi4iotState.certs.mqtt_certs.ca_certs.expiration_timestamp < limitTimestamp) {
		certsUpdateIsNeedeed = true;
	}

	if (!fs.existsSync('./certs/domain_certs/iot_platform.key')) {
		certsUpdateIsNeedeed = true;
	}

	if (!fs.existsSync('./certs/domain_certs/iot_platform_ca.pem')) {
		certsUpdateIsNeedeed = true;
	} else {
		if (osi4iotState.certs.domain_certs.ca_pem_expiration_timestamp < limitTimestamp) {
			if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
				certsUpdateIsNeedeed = true;
			} else if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Certs provided by an CA") {
				throw new Error("The iot_platform_ca.pem certificate is expired");
			}
		}
	}

	if (!fs.existsSync('./certs/domain_certs/iot_platform_cert.cer')) {
		certsUpdateIsNeedeed = true;
	} else {
		if (osi4iotState.certs.domain_certs.cert_crt_expiration_timestamp < limitTimestamp) {
			if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
				certsUpdateIsNeedeed = true;
			} else if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Certs provided by an CA") {
				throw new Error("The iot_platform_cert.cer certificate is expired");
			}
		}
	}

	if (!fs.existsSync('./certs/domain_certs/iot_platform_comb_cert.cer')) {
		certsUpdateIsNeedeed = true;
	}

	if (osi4iotState.certs.mqtt_certs.broker.expiration_timestamp < limitTimestamp) {
		certsUpdateIsNeedeed = true;
	}

	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const num_nodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
		for (let idev = 1; idev <= num_nodeRedInstances; idev++) {
			if (osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].expiration_timestamp < limitTimestamp) {
				certsUpdateIsNeedeed = true;
			}
		}
	}

	return certsUpdateIsNeedeed;
}