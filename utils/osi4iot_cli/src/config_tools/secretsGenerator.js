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
		`TIMESCALE_DB=${osi4iotState.platformInfo.TIMESCALE_DB}\n`,
		`GRAFANA_DATASOURCE_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DATASOURCE_PASSWORD}`,
	];

	if (fs.existsSync('./secrets/grafana.txt')) {
		fs.rmSync('./secrets/grafana.txt');
	}

	for (let iline = 0; iline < grafanaSecrets.length; iline++) {
		fs.appendFileSync('./secrets/grafana.txt', grafanaSecrets[iline]);
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


	//postgres_grafana secrets
	const postgresGrafanaSecret = `GRAFANA_DB_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DB_PASSWORD}`;
	if (fs.existsSync('./secrets/postgres_grafana.txt')) {
		fs.rmSync('./secrets/postgres_grafana.txt');
	}
	fs.appendFileSync('./secrets/postgres_grafana.txt', postgresGrafanaSecret);

	//timescaledb_password secret
	if (fs.existsSync('./secrets/timescaledb_password.txt')) {
		fs.rmSync('./secrets/timescaledb_password.txt');
	}
	fs.appendFileSync('./secrets/timescaledb_password.txt', `${osi4iotState.platformInfo.TIMESCALE_PASSWORD}`);

	//timescaledb_user secret
	if (fs.existsSync('./secrets/timescaledb_user.txt')) {
		fs.rmSync('./secrets/timescaledb_user.txt');
	}
	fs.appendFileSync('./secrets/timescaledb_user.txt', `${osi4iotState.platformInfo.TIMESCALE_USER}`);

	//timescaledb_grafana secrets
	const timescaledbGrafanaSecrets = `GRAFANA_DATASOURCE_PASSWORD=${osi4iotState.platformInfo.GRAFANA_DATASOURCE_PASSWORD}`;
	if (fs.existsSync('./secrets/timescaledb_grafana.txt')) {
		fs.rmSync('./secrets/timescaledb_grafana.txt');
	}
	fs.appendFileSync('./secrets/timescaledb_grafana.txt', timescaledbGrafanaSecrets);

	//dev2pdb_password secret
	if (fs.existsSync('./secrets/dev2pdb_password.txt')) {
		fs.rmSync('./secrets/dev2pdb_password.txt');
	}
	fs.appendFileSync('./secrets/dev2pdb_password.txt', `${osi4iotState.platformInfo.DEV2PDB_PASSWORD}`);

	//minio secrets
	const minioSecrets = [
		`MINIO_ROOT_USER=${osi4iotState.platformInfo.PLATFORM_ADMIN_USER_NAME}\n`,
		`MINIO_ROOT_PASSWORD=${osi4iotState.platformInfo.PLATFORM_ADMIN_PASSWORD}`
	];

	if (fs.existsSync('./secrets/minio.txt')) {
		fs.rmSync('./secrets/minio.txt');
	}

	for (let iline = 0; iline < minioSecrets.length; iline++) {
		fs.appendFileSync('./secrets/minio.txt', minioSecrets[iline]);
	}

	//pgadmin4 secrets
	if (fs.existsSync('./secrets/pgadmin4.txt')) {
		fs.rmSync('./secrets/pgadmin4.txt');
	}
	if (osi4iotState.platformInfo.DEPLOYMENT_MODE === "development") {
		const pgadmin4Secrets = [
			`PGADMIN_DEFAULT_EMAIL=${osi4iotState.platformInfo.PGADMIN_DEFAULT_EMAIL}\n`,
			`PGADMIN_DEFAULT_PASSWORD=${osi4iotState.platformInfo.PGADMIN_DEFAULT_PASSWORD}\n`,
			`POSTGRES_USER=${osi4iotState.platformInfo.POSTGRES_USER}`
		];

		for (let iline = 0; iline < pgadmin4Secrets.length; iline++) {
			fs.appendFileSync('./secrets/pgadmin4.txt', pgadmin4Secrets[iline]);
		}
	}

};