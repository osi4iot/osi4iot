const fs = require('fs');

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

    for (let iline = 0; iline < adminApiSecrets.length; iline++) {
        fs.appendFileSync('./secrets/admin_api.txt', adminApiSecrets[iline]);
    }


    //grafana secrets
    const grafanaSecrets = [
        `GRAFANA_ADMIN_PASSWORD=${osi4iotState.platformInfo.GRAFANA_ADMIN_PASSWORD}\n`,
        `NOTIFICATIONS_EMAIL_USER=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_USER}\n`,
        `NOTIFICATIONS_EMAIL_PASSWORD=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_PASSWORD}\n`,
        `NOTIFICATIONS_EMAIL_ADDRESS=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_ADDRESS}\n`,
        `POSTGRES_DB=${osi4iotState.platformInfo.POSTGRES_DB}\n`,
        `GRAFANA_DB_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DB_PASSWORD}\n`,
        `GRAFANA_DATASOURCE_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DATASOURCE_PASSWORD}`,
    ];

    if (fs.existsSync('./secrets/grafana.txt')) {
        fs.rmSync('./secrets/grafana.txt');
    }

    for (let iline = 0; iline < grafanaSecrets.length; iline++) {
        fs.appendFileSync('./secrets/grafana.txt', grafanaSecrets[iline]);
    }

    //nodered secrets
    const noderedSecrets = [
        `POSTGRES_USER=${osi4iotState.platformInfo.POSTGRES_USER}\n`,
        `POSTGRES_PASSWORD=${osi4iotState.platformInfo.POSTGRES_PASSWORD}\n`,
        `POSTGRES_DB=${osi4iotState.platformInfo.POSTGRES_DB}\n`,
        `NODE_RED_ADMIN=${osi4iotState.platformInfo.NODE_RED_ADMIN}\n`,
        `NODE_RED_ADMIN_HASH=${osi4iotState.platformInfo.NODE_RED_ADMIN_HASH}`
    ];

    if (fs.existsSync('./secrets/nodered.txt')) {
        fs.rmSync('./secrets/nodered.txt');
    }

    for (let iline = 0; iline < noderedSecrets.length; iline++) {
        fs.appendFileSync('./secrets/nodered.txt', noderedSecrets[iline]);
    }

    //pgadmin4 secrets
    const pgadmin4Secrets = [
        `PGADMIN_DEFAULT_EMAIL=${osi4iotState.platformInfo.PGADMIN_DEFAULT_EMAIL}\n`,
        `PGADMIN_DEFAULT_PASSWORD=${osi4iotState.platformInfo.PGADMIN_DEFAULT_PASSWORD}\n`,
        `POSTGRES_USER=${osi4iotState.platformInfo.POSTGRES_USER}`
    ];

    if (fs.existsSync('./secrets/pgadmin4.txt')) {
        fs.rmSync('./secrets/pgadmin4.txt');
    }

    for (let iline = 0; iline < pgadmin4Secrets.length; iline++) {
        fs.appendFileSync('./secrets/pgadmin4.txt', pgadmin4Secrets[iline]);
    }

    //postgres_db secret
    if (fs.existsSync('./secrets/postgres_db.txt')) {
        fs.rmSync('./secrets/postgres_db.txt');
    }
    fs.appendFileSync('./secrets/postgres_db.txt', `${osi4iotState.platformInfo.POSTGRES_DB}`);


    //postgres_grafana secrets
    const postgresGrafanaSecrets = [
        `GRAFANA_DB_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DB_PASSWORD}\n`,
        `GRAFANA_DATASOURCE_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DATASOURCE_PASSWORD}`,
    ];
    if (fs.existsSync('./secrets/postgres_grafana.txt')) {
        fs.rmSync('./secrets/postgres_grafana.txt');
    }

    for (let iline = 0; iline < postgresGrafanaSecrets.length; iline++) {
        fs.appendFileSync('./secrets/postgres_grafana.txt', postgresGrafanaSecrets[iline]);
    }

    //postgres_password secret
    if (fs.existsSync('./secrets/postgres_password.txt')) {
        fs.rmSync('./secrets/postgres_password.txt');
    }
    fs.appendFileSync('./secrets/postgres_password.txt', `${osi4iotState.platformInfo.POSTGRES_PASSWORD}`);

    //postgres_user secret
    if (fs.existsSync('./secrets/postgres_user.txt')) {
        fs.rmSync('./secrets/postgres_user.txt');
    }
    fs.appendFileSync('./secrets/postgres_user.txt', `${osi4iotState.platformInfo.POSTGRES_USER}`);

};