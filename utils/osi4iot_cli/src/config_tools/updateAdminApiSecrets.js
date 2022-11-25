import fs from 'fs';
import md5 from 'md5';
import { insertQuotesInText } from "./configGenerator.js"

export default function (osi4iotState) {

	const secrets_dir = "./secrets"
	if (!fs.existsSync(secrets_dir)) fs.mkdirSync(secrets_dir);

	const mainOrgNodeRedInstances = osi4iotState.certs.mqtt_certs.organizations[0].nodered_instances;
	const mainOrgNodeRedInstanceHashes = mainOrgNodeRedInstances.map(nri => nri.nri_hash).join(",");

	//admin_api secrets
	const adminApiSecrets = [
		`REGISTRATION_TOKEN_LIFETIME=${osi4iotState.platformInfo.REGISTRATION_TOKEN_LIFETIME}\n`,
		`REFRESH_TOKEN_LIFETIME=${osi4iotState.platformInfo.REFRESH_TOKEN_LIFETIME}\n`,
		`REFRESH_TOKEN_SECRET=${osi4iotState.platformInfo.REFRESH_TOKEN_SECRET}\n`,
		`ACCESS_TOKEN_SECRET=${osi4iotState.platformInfo.ACCESS_TOKEN_SECRET}\n`,
		`ACCESS_TOKEN_LIFETIME=${osi4iotState.platformInfo.ACCESS_TOKEN_LIFETIME}\n`,
		`MQTT_SSL_CERTS_VALIDITY_DAYS=${osi4iotState.platformInfo.MQTT_SSL_CERTS_VALIDITY_DAYS}\n`,
		`ENCRYPTION_SECRET_KEY=${osi4iotState.platformInfo.ENCRYPTION_SECRET_KEY}\n`,
		insertQuotesInText("PLATFORM_ADMIN_FIRST_NAME", osi4iotState.platformInfo.PLATFORM_ADMIN_FIRST_NAME, "\n"),
		insertQuotesInText("PLATFORM_ADMIN_SURNAME", osi4iotState.platformInfo.PLATFORM_ADMIN_SURNAME, "\n"),
		`PLATFORM_ADMIN_USER_NAME=${osi4iotState.platformInfo.PLATFORM_ADMIN_USER_NAME}\n`,
		`PLATFORM_ADMIN_EMAIL=${osi4iotState.platformInfo.PLATFORM_ADMIN_EMAIL}\n`,
		`PLATFORM_ADMIN_PASSWORD=${osi4iotState.platformInfo.PLATFORM_ADMIN_PASSWORD}\n`,
		`GRAFANA_ADMIN_PASSWORD=${osi4iotState.platformInfo.GRAFANA_ADMIN_PASSWORD}\n`,
		`POSTGRES_USER=${osi4iotState.platformInfo.POSTGRES_USER}\n`,
		`POSTGRES_PASSWORD=${osi4iotState.platformInfo.POSTGRES_PASSWORD}\n`,
		`POSTGRES_DB=${osi4iotState.platformInfo.POSTGRES_DB}\n`,
		`DEV2PDB_PASSWORD=${osi4iotState.platformInfo.POSTGRES_PASSWORD}\n`,
		`NOTIFICATIONS_EMAIL_USER=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_USER}\n`,
		`NOTIFICATIONS_EMAIL_PASSWORD=${osi4iotState.platformInfo.NOTIFICATIONS_EMAIL_PASSWORD}\n`,
		`MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=${osi4iotState.platformInfo.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID}\n`,
		`MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=${osi4iotState.platformInfo.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK}\n`,
		`TELEGRAM_BOTTOKEN=${osi4iotState.platformInfo.TELEGRAM_BOTTOKEN}\n`,
		`MAIN_ORG_HASH=${osi4iotState.certs.mqtt_certs.organizations[0].org_hash}\n`,
		`AWS_ACCESS_KEY_ID=${osi4iotState.platformInfo.AWS_ACCESS_KEY_ID}\n`,
		`AWS_SECRET_ACCESS_KEY=${osi4iotState.platformInfo.AWS_SECRET_ACCESS_KEY}\n`,
		`MAIN_ORG_NODERED_INSTANCE_HASHES=${mainOrgNodeRedInstanceHashes}`,
	];

	if (fs.existsSync('./secrets/admin_api.txt')) {
		fs.rmSync('./secrets/admin_api.txt');
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