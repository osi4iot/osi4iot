import fs from 'fs';
import updateAdminApiSecrets from './updateAdminApiSecrets.js';

export default function (osi4iotState) {

	const secrets_dir = "./secrets"
	if (!fs.existsSync(secrets_dir)) fs.mkdirSync(secrets_dir);

	//admin_api secrets
	updateAdminApiSecrets(osi4iotState);

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

	if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION === "AWS cluster deployment") {
		if (fs.existsSync('./secrets/traefik_aws.txt')) {
			fs.rmSync('./secrets/traefik_aws.txt');
		}
		const traefikAWSSecrets = [
			`AWS_ACCESS_KEY_ID=${osi4iotState.platformInfo.AWS_ACCESS_KEY_ID}\n`,
			`AWS_SECRET_ACCESS_KEY=${osi4iotState.platformInfo.AWS_SECRET_ACCESS_KEY}`,
		];
		for (let iline = 0; iline < traefikAWSSecrets.length; iline++) {
			fs.appendFileSync('./secrets/traefik_aws.txt', traefikAWSSecrets[iline]);
		}
	}

};