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
					const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
					const org_acronym = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_acronym;
					for (let idev = 1; idev <= num_master_devices; idev++) {
						const md_hash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].md_hash;
						const masterDeviceCertsDir = `./certs/mqtt_certs/org_${org_acronym}_md_${md_hash}`;
						if (fs.existsSync(masterDeviceCertsDir)) {
							fs.rmSync(masterDeviceCertsDir, { recursive: true, force: true });
						}
					}
				}
			}
		}
	} catch (error) {
		throw new Error("Error removing certs files")
	}
};