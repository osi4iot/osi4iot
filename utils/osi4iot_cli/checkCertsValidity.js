const fs = require('fs');
const md5 = require('md5');

module.exports = (osi4iotState) => {
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
            throw new Error("The iot_platform_ca.pem certificate is expired");
        }
        const caPemCert = fs.readFileSync('./certs/domain_certs/iot_platform_ca.pem');
        const currentMd5Value = md5(caPemCert);
        const caNameMd5Value = osi4iotState.certs.domain_certs.iot_platform_ca_name.split("_")[3];
        if (currentMd5Value !== caNameMd5Value) {
            certsUpdateIsNeedeed = true;
        }
    }

    if (!fs.existsSync('./certs/domain_certs/iot_platform_cert.cer')) {
        certsUpdateIsNeedeed = true;
    } else {
        if (osi4iotState.certs.domain_certs.cert_crt_expiration_timestamp < limitTimestamp) {
            throw new Error("The iot_platform_cert.cer certificate is expired");
        }
        const certCrt = fs.readFileSync('./certs/domain_certs/iot_platform_cert.cer');
        const currentMd5Value = md5(certCrt);
        const certNameMd5Value = osi4iotState.certs.domain_certs.iot_platform_cert_name.split("_")[3];
        if (currentMd5Value !== certNameMd5Value) {
            certsUpdateIsNeedeed = true;
        }
    }

    if (osi4iotState.certs.mqtt_certs.broker.expiration_timestamp < limitTimestamp) {
        certsUpdateIsNeedeed = true;
    }

    if (osi4iotState.certs.mqtt_certs.nodered.expiration_timestamp < limitTimestamp) {
        certsUpdateIsNeedeed = true;
    }

    for (iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
        const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
        for (idev = 1; idev <= num_master_devices; idev++) {
            if (osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].expiration_timestamp < limitTimestamp) {
                certsUpdateIsNeedeed = true;
            }
        }
    }

    return certsUpdateIsNeedeed;
}