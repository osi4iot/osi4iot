export default function (osi4iotState) {
	let areMasterDeviceVolumesCreated = true;


	for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
		const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
		for (let idev = 1; idev <= num_master_devices; idev++) {
			if (osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].is_volume_created === 'false') {
				areMasterDeviceVolumesCreated = false;
			}
		}
	}
	return areMasterDeviceVolumesCreated;
}