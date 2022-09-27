import fs from 'fs';

export default function (osi4iotState) {
	try {
		const certs_dir = "./certs"
		if (fs.existsSync(certs_dir)) {
			const domain_certs_dir = "./certs/domain_certs"
			if (fs.existsSync(domain_certs_dir)) {
				if (fs.existsSync('./certs/domain_certs/iot_platform.key')) {
					fs.rmSync('./certs/domain_certs/iot_platform.key');
				}

				if (fs.existsSync('./certs/domain_certs/iot_platform_ca.pem')) {
					fs.rmSync('./certs/domain_certs/iot_platform_ca.pem');
				}

				if (fs.existsSync('./certs/domain_certs/iot_platform_cert.cer')) {
					fs.rmSync('./certs/domain_certs/iot_platform_cert.cer');
				}
			}


			const mqtt_certs_dir = "./certs/mqtt_certs"
			if (fs.existsSync(mqtt_certs_dir)) {

				const ca_certs_dir = "./certs/mqtt_certs/ca_certs";
				if (fs.existsSync(ca_certs_dir)) {
					if (fs.existsSync('./certs/mqtt_certs/ca_certs/ca.key')) {
						fs.rmSync('./certs/mqtt_certs/ca_certs/ca.key');
					}

					if (fs.existsSync('./certs/mqtt_certs/ca_certs/ca.crt')) {
						fs.rmSync('./certs/mqtt_certs/ca_certs/ca.crt');
					}
				}

				const broker_dir = "./certs/mqtt_certs/broker";
				if (fs.existsSync(broker_dir)) {
					if (fs.existsSync('./certs/mqtt_certs/broker/server.key')) {
						fs.rmSync('./certs/mqtt_certs/broker/server.key');
					}

					if (fs.existsSync('./certs/mqtt_certs/broker/server.crt')) {
						fs.rmSync('./certs/mqtt_certs/broker/server.crt');
					}
				}

				for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
					const nodered_instances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
					const org_acronym = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_acronym;
					for (let inri = 1; inri <= nodered_instances; inri++) {
						const nri_hash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[inri - 1].nri_hash;
						const nodeRedInstanceCertsDir = `./certs/mqtt_certs/org_${org_acronym}_nri_${nri_hash}`;
						if (fs.existsSync(nodeRedInstanceCertsDir)) {
							fs.rmSync(nodeRedInstanceCertsDir, { recursive: true, force: true });
						}
					}
				}
			}
		}
	} catch (error) {
		throw new Error("Error removing certs files")
	}
};