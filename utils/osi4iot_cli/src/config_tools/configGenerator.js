import fs from 'fs';

const insertQuotesInText = (key, value, carrReturn) => {
	let text = `${key}=${value}${carrReturn}`;
	if (value.indexOf(" ") !== -1) text = `${key}="${value}"${carrReturn}`;
	return text;
}

export default function (osi4iotState) {
	const config_dir = "./config"
	if (!fs.existsSync(config_dir)) {
		fs.mkdirSync(config_dir);

		const admin_api_conf_dir = "./config/admin_api";
		if (!fs.existsSync(admin_api_conf_dir)) {
			fs.mkdirSync(admin_api_conf_dir);
		}

		const frontend_conf_dir = "./config/frontend";
		if (!fs.existsSync(frontend_conf_dir)) {
			fs.mkdirSync(frontend_conf_dir);
		}

		const grafana_conf_dir = "./config/grafana";
		if (!fs.existsSync(grafana_conf_dir)) {
			fs.mkdirSync(grafana_conf_dir);
		}

		const mosquitto_conf_dir = "./config/mosquitto";
		if (!fs.existsSync(mosquitto_conf_dir)) {
			fs.mkdirSync(mosquitto_conf_dir);
		}

		const nodered_conf_dir = "./config/nodered";
		if (!fs.existsSync(nodered_conf_dir)) {
			fs.mkdirSync(nodered_conf_dir);
		}

	}

	//admin_api config
	const adminApiConfig = [
		`PLATFORM_NAME=${osi4iotState.platformInfo.PLATFORM_NAME.replace(/ /g, "_")}\n`,
		`DOMAIN_NAME=${osi4iotState.platformInfo.DOMAIN_NAME}\n`,
		insertQuotesInText("PLATFORM_PHRASE", osi4iotState.platformInfo.PLATFORM_PHRASE, "\n"),
		insertQuotesInText("MAIN_ORGANIZATION_NAME", osi4iotState.platformInfo.MAIN_ORGANIZATION_NAME, "\n"),
		`MAIN_ORGANIZATION_ACRONYM=${osi4iotState.platformInfo.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_")}\n`,
		insertQuotesInText("MAIN_ORGANIZATION_ADDRESS1", osi4iotState.platformInfo.MAIN_ORGANIZATION_ADDRESS1, "\n"),
		insertQuotesInText("MAIN_ORGANIZATION_CITY", osi4iotState.platformInfo.MAIN_ORGANIZATION_CITY, "\n"),
		`MAIN_ORGANIZATION_ZIP_CODE=${osi4iotState.platformInfo.MAIN_ORGANIZATION_ZIP_CODE}\n`,
		insertQuotesInText("MAIN_ORGANIZATION_STATE", osi4iotState.platformInfo.MAIN_ORGANIZATION_STATE, "\n"),
		insertQuotesInText("MAIN_ORGANIZATION_COUNTRY", osi4iotState.platformInfo.MAIN_ORGANIZATION_COUNTRY, ""),
	];

	if (fs.existsSync('./config/admin_api/admin_api.conf')) {
		fs.rmSync('./config/admin_api/admin_api.conf');
	}

	for (let iline = 0; iline < adminApiConfig.length; iline++) {
		fs.appendFileSync('./config/admin_api/admin_api.conf', adminApiConfig[iline]);
	}


	//frontend config
	const frontendConfig = [
		`PLATFORM_NAME=${osi4iotState.platformInfo.PLATFORM_NAME.replace(/ /g, "_")}\n`,
		`DOMAIN_NAME=${osi4iotState.platformInfo.DOMAIN_NAME}\n`,
		`MIN_LONGITUDE=${osi4iotState.platformInfo.MIN_LONGITUDE}\n`,
		`MAX_LONGITUDE=${osi4iotState.platformInfo.MAX_LONGITUDE}\n`,
		`MIN_LATITUDE=${osi4iotState.platformInfo.MIN_LATITUDE}\n`,
		`MAX_LATITUDE=${osi4iotState.platformInfo.MAX_LATITUDE}`
	];

	if (fs.existsSync('./config/frontend/frontend.conf')) {
		fs.rmSync('./config/frontend/frontend.conf');
	}

	for (let iline = 0; iline < frontendConfig.length; iline++) {
		fs.appendFileSync('./config/frontend/frontend.conf', frontendConfig[iline]);
	}


	//grafana config
	const grafanaConfig = [
		`DOMAIN_NAME=${osi4iotState.platformInfo.DOMAIN_NAME}\n`,
		`DEFAULT_TIME_ZONE=${osi4iotState.platformInfo.DEFAULT_TIME_ZONE}\n`,
		insertQuotesInText("MAIN_ORGANIZATION_NAME", osi4iotState.platformInfo.MAIN_ORGANIZATION_NAME, "\n"),
		`MAIN_ORGANIZATION_ACRONYM=${osi4iotState.platformInfo.MAIN_ORGANIZATION_ACRONYM.replace(/ /g, "_")}`,
	];

	if (fs.existsSync('./config/grafana/grafana.conf')) {
		fs.rmSync('./config/grafana/grafana.conf');
	}

	for (let iline = 0; iline < grafanaConfig.length; iline++) {
		fs.appendFileSync('./config/grafana/grafana.conf', grafanaConfig[iline]);
	}

	//nodered config
	const noderedConfig = [
		`PORT=1880\n`,
		`DOMAIN_NAME=${osi4iotState.platformInfo.DOMAIN_NAME}`
	];

	if (fs.existsSync('./config/nodered/nodered.conf')) {
		fs.rmSync('./config/nodered/nodered.conf');
	}

	for (let iline = 0; iline < noderedConfig.length; iline++) {
		fs.appendFileSync('./config/nodered/nodered.conf', noderedConfig[iline]);
	}

	//mosquitto config
	const mosquittoConfig = [
		"per_listener_settings true\n",
		"persistence true\n",
		"persistence_location /mosquitto/data/\n",
		"log_type error\n",
		"log_type warning\n",
		"log_type notice\n",
		"log_type information\n",
		"log_dest stdout\n",
		"\n",
		"# MQTT plain\n",
		"listener 1883\n",
		"protocol mqtt\n",
		"allow_anonymous true\n",
		"\n",
		"# MQTT over TLS/SSL\n",
		"listener 8883\n",
		"protocol mqtt\n",
		"cafile /mosquitto/mqtt_certs/ca.crt\n",
		"certfile /mosquitto/mqtt_certs/server.crt\n",
		"keyfile /mosquitto/mqtt_certs/server.key\n",
		"require_certificate true\n",
		"use_identity_as_username true\n",
		"\n",
		"\n",
		"# MQTT over WSS\n",
		"listener 9001\n",
		"protocol websockets\n",
		"cafile /mosquitto/wss_certs/iot_platform_ca.pem\n",
		"certfile /mosquitto/wss_certs/iot_platform_cert.cer\n",
		"keyfile /mosquitto/wss_certs/iot_platform.key\n",
		"allow_anonymous true"
	]

	if (fs.existsSync('./config/mosquitto/mosquitto.conf')) {
		fs.rmSync('./config/mosquitto/mosquitto.conf');
	}

	for (let iline = 0; iline < mosquittoConfig.length; iline++) {
		fs.appendFileSync('./config/mosquitto/mosquitto.conf', mosquittoConfig[iline]);
	}

};