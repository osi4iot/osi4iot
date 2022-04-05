export default function(osi4iotState) {
    osi4iotState.platformInfo.IS_NODERED_VOLUME_ALREADY_CREATED = 'true'
    for (let iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
        const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
        for (let idev = 1; idev <= num_master_devices; idev++) {
            osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].is_volume_created = 'true';
        }
    }
}