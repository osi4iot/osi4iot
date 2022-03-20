const fs = require('fs');
const md5 = require('md5');

const insertQuotesInText = (key, value, carrReturn) => {
    let text = `${key}=${value}${carrReturn}`;
    if (value.indexOf(" ") !== -1) text = `${key}="${value}"${carrReturn}`;
    return text;
}

module.exports = (osi4iotState) => {

    const secrets_dir = "./secrets"
    if (!fs.existsSync(secrets_dir)) fs.mkdirSync(secrets_dir);

    //admin_api secrets
    const adminApiSecrets = [
        `REGISTRATION_TOKEN_LIFETIME=${osi4iotState.platformInfo.REGISTRATION_TOKEN_LIFETIME}\n`,
        `REFRESH_TOKEN_LIFETIME=${osi4iotState.platformInfo.REFRESH_TOKEN_LIFETIME}\n`,
        `REFRESH_TOKEN_SECRET=${osi4iotState.platformInfo.REFRESH_TOKEN_SECRET}\n`,
        `ACCESS_TOKEN_SECRET=${osi4iotState.platformInfo.ACCESS_TOKEN_SECRET}\n`,
        `ACCESS_TOKEN_LIFETIME=${osi4iotState.platformInfo.ACCESS_TOKEN_LIFETIME}\n`,
        `MQTT_SSL_CERTS_VALIDITY_DAYS=${osi4iotState.platformInfo.MQTT_SSL_CERTS_VALIDITY_DAYS}\n`,
        `ENCRYPTION_SECRET_KEY=${osi4iotState.platformInfo.ENCRYPTION_SECRET_KEY}\n`,
        insertQuotesInText("PLATFORM_ADMIN_FIRST_NAME", osi4iotState.platformInfo.PLATFORM_ADMIN_FIRST_NAME,"\n"),
        insertQuotesInText("PLATFORM_ADMIN_SURNAME", osi4iotState.platformInfo.PLATFORM_ADMIN_SURNAME,"\n"),
        `PLATFORM_ADMIN_USER_NAME=${osi4iotState.platformInfo.PLATFORM_ADMIN_USER_NAME}\n`,
        `PLATFORM_ADMIN_EMAIL=${osi4iotState.platformInfo.PLATFORM_ADMIN_EMAIL}\n`,
        `PLATFORM_ADMIN_PASSWORD=${osi4iotState.platformInfo.PLATFORM_ADMIN_PASSWORD}\n`,
        `PLATFORM_ADMIN_TELEGRAM_ID=1111111111111\n`,
        `GRAFANA_ADMIN_PASSWORD=${osi4iotState.platformInfo.GRAFANA_ADMIN_PASSWORD}\n`,
        `POSTGRES_USER=${osi4iotState.platformInfo.POSTGRES_USER}\n`,
        `POSTGRES_PASSWORD=${osi4iotState.platformInfo.POSTGRES_PASSWORD}\n`,
        `POSTGRES_DB=${osi4iotState.platformInfo.POSTGRES_DB}\n`,
        `NOTIFICATIONS_EMAIL_USER=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_USER}\n`,
        `NOTIFICATIONS_EMAIL_PASSWORD=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_PASSWORD}\n`,
        `MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=${osi4iotState.platformInfo.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID}\n`,
        `MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=${osi4iotState.platformInfo.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK}\n`,
        `TELEGRAM_BOTTOKEN=${osi4iotState.platformInfo.TELEGRAM_BOTTOKEN}\n`
    ];

    if (fs.existsSync('./secrets/admin_api.txt')) {
        fs.rmSync('./secrets/admin_api.txt');
    }

    for (iorg = 1; iorg <= osi4iotState.certs.mqtt_certs.organizations.length; iorg++) {
        const num_master_devices = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length;
        adminApiSecrets.push(`ORG_${iorg}_HASH=${osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash}\n`)
        let orgMasterDevicesHashes = `ORG_${iorg}_MASTER_DEVICE_HASHES=`;
        for (idev = 1; idev <= num_master_devices; idev++) {
            const mdHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices[idev - 1].md_hash;
            orgMasterDevicesHashes = orgMasterDevicesHashes + mdHash;
            if (idev < num_master_devices) orgMasterDevicesHashes = orgMasterDevicesHashes + ",";
            else {
                if (iorg < osi4iotState.certs.mqtt_certs.organizations.length) orgMasterDevicesHashes = orgMasterDevicesHashes + "\n";
            }
        }
        adminApiSecrets.push(orgMasterDevicesHashes)
    }

    let adminApiSecretsString = "";
    for (let iline = 0; iline < adminApiSecrets.length; iline++) {
        if (iline < (adminApiSecrets.length - 1)) {
            adminApiSecretsString = `${adminApiSecretsString}${adminApiSecrets[iline]}\n`
        } else {
            adminApiSecretsString = `${adminApiSecretsString}${adminApiSecrets[iline]}`
        }
        fs.appendFileSync('./secrets/admin_api.txt', adminApiSecrets[iline]);
    }

    osi4iotState.admin_api_secret_name = `admin_api_${md5(adminApiSecretsString)}`;

};