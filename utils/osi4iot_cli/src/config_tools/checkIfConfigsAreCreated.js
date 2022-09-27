import fs from 'fs';

export default function () {
	let areConfigsCreated = true;

	const admin_api_conf_file = "./config/admin_api/admin_api.conf";
	if (!fs.existsSync(admin_api_conf_file)) {
		areConfigsCreated = false;
	}

	const frontend_conf_file = "./config/frontend/frontend.conf"
	if (!fs.existsSync(frontend_conf_file)) {
		areConfigsCreated = false;
	}

	const grafana_conf_file = "./config/grafanag/rafana.conf";
	if (!fs.existsSync(grafana_conf_file)) {
		areConfigsCreated = false;
	}

	const mosquitto_conf_file = "./config/mosquitto/mosquitto.conf";
	if (!fs.existsSync(mosquitto_conf_file)) {
		areConfigsCreated = false;
	}

	const mosquitto_go_auth_conf_file = "./config/mosquitto/go-auth.conf";
	if (!fs.existsSync(mosquitto_go_auth_conf_file)) {
		areConfigsCreated = false;
	}

	return areConfigsCreated;
}