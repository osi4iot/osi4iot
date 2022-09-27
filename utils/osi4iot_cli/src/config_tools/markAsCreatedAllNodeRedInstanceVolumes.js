export default function (osi4iotState) {
	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const num_nodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances.length;
		for (let idev = 1; idev <= num_nodeRedInstances; idev++) {
			osi4iotState.certs.mqtt_certs.organizations[iorg - 1].nodered_instances[idev - 1].is_volume_created = 'true';
		}
	}
}