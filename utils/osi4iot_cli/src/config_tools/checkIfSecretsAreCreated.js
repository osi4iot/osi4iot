import fs from 'fs';

export default function (osi4iotState) {
	let areSecretsCreated = true;
	if (!fs.existsSync('./secrets/admin_api.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/grafana.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/postgres_password.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/postgres_user.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/postgres_grafana.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/timescaledb_password.txt')) {
		areSecretsCreated = false;
	}

	if (!fs.existsSync('./secrets/timescaledb_user.txt')) {
		areSecretsCreated = false;
	}
	
	if (!fs.existsSync('./secrets/timescaledb_grafana.txt')) {
		areSecretsCreated = false;
	}



	if (osi4iotState.platformInfo.DEPLOYMENT_MODE === "development") {
		if (!fs.existsSync('./secrets/pgadmin4.txt')) {
			areSecretsCreated = false;
		}
	}

	return areSecretsCreated;
}