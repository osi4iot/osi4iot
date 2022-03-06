import fs from "fs";
import { logger } from "./winston";

interface IProcessEnv extends Record<string, string | string[][]> {
	PLATFORM_NAME: string;
	DOMAIN_NAME: string;
	PLATFORM_PHRASE: string;
	MAIN_ORGANIZATION_NAME: string;
	MAIN_ORGANIZATION_ACRONYM: string;
	MAIN_ORGANIZATION_ADDRESS1: string;
	MAIN_ORGANIZATION_CITY: string;
	MAIN_ORGANIZATION_ZIP_CODE: string;
	MAIN_ORGANIZATION_STATE: string;
	MAIN_ORGANIZATION_COUNTRY: string;
	REGISTRATION_TOKEN_LIFETIME: string;
	REFRESH_TOKEN_LIFETIME: string;
	REFRESH_TOKEN_SECRET: string;
	ACCESS_TOKEN_SECRET: string;
	ACCESS_TOKEN_LIFETIME: string;
	MQTT_SSL_CERTS_VALIDITY_DAYS: string;
	ENCRYPTION_SECRET_KEY: string;
	PLATFORM_ADMIN_FIRST_NAME: string;
	PLATFORM_ADMIN_SURNAME: string;
	PLATFORM_ADMIN_USER_NAME: string;
	PLATFORM_ADMIN_EMAIL: string;
	PLATFORM_ADMIN_PASSWORD: string;
	PLATFORM_ADMIN_TELEGRAM_ID: string;
	GRAFANA_ADMIN_PASSWORD: string;
	POSTGRES_USER: string;
	POSTGRES_PASSWORD: string;
	POSTGRES_DB: string;
	NOTIFICATIONS_EMAIL_USER: string;
	NOTIFICATIONS_EMAIL_PASSWORD: string;
	MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: string;
	MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: string;
	TELEGRAM_BOTTOKEN: string;
	MASTER_DEVICE_HASHES: string[][];
}

const process_env: IProcessEnv = {
	PLATFORM_NAME: process.env.PLATFORM_NAME,
	DOMAIN_NAME: process.env.DOMAIN_NAME,
	PLATFORM_PHRASE: process.env.PLATFORM_PHRASE,
	MAIN_ORGANIZATION_NAME: process.env.MAIN_ORGANIZATION_NAME,
	MAIN_ORGANIZATION_ACRONYM: process.env.MAIN_ORGANIZATION_ACRONYM,
	MAIN_ORGANIZATION_ADDRESS1: process.env.MAIN_ORGANIZATION_ADDRESS1,
	MAIN_ORGANIZATION_CITY: process.env.MAIN_ORGANIZATION_CITY,
	MAIN_ORGANIZATION_ZIP_CODE: process.env.MAIN_ORGANIZATION_ZIP_CODE,
	MAIN_ORGANIZATION_STATE: process.env.MAIN_ORGANIZATION_STATE,
	MAIN_ORGANIZATION_COUNTRY: process.env.MAIN_ORGANIZATION_COUNTRY,
	REGISTRATION_TOKEN_LIFETIME: process.env.REGISTRATION_TOKEN_LIFETIME,
	REFRESH_TOKEN_LIFETIME: process.env.REFRESH_TOKEN_LIFETIME,
	REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
	ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
	ACCESS_TOKEN_LIFETIME: process.env.ACCESS_TOKEN_LIFETIME,
	MQTT_SSL_CERTS_VALIDITY_DAYS: process.env.MQTT_SSL_CERTS_VALIDITY_DAYS,
	ENCRYPTION_SECRET_KEY: process.env.ENCRYPTION_SECRET_KEY,
	PLATFORM_ADMIN_FIRST_NAME: process.env.PLATFORM_ADMIN_FIRST_NAME,
	PLATFORM_ADMIN_SURNAME: process.env.PLATFORM_ADMIN_SURNAME,
	PLATFORM_ADMIN_USER_NAME: process.env.PLATFORM_ADMIN_USER_NAME,
	PLATFORM_ADMIN_EMAIL: process.env.PLATFORM_ADMIN_EMAIL,
	PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD,
	PLATFORM_ADMIN_TELEGRAM_ID: process.env.PLATFORM_ADMIN_TELEGRAM_ID,
	GRAFANA_ADMIN_PASSWORD: process.env.GRAFANA_ADMIN_PASSWORD,
	POSTGRES_USER: process.env.POSTGRES_USER,
	POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
	POSTGRES_DB: process.env.POSTGRES_DB,
	NOTIFICATIONS_EMAIL_USER: process.env.NOTIFICATIONS_EMAIL_USER,
	NOTIFICATIONS_EMAIL_PASSWORD: process.env.NOTIFICATIONS_EMAIL_PASSWORD,
	MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: process.env.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
	MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: process.env.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
	TELEGRAM_BOTTOKEN: process.env.TELEGRAM_BOTTOKEN,
	MASTER_DEVICE_HASHES: []
};

const readDockerFiles = (dockerFileName: string) => {
	if (fs.existsSync(dockerFileName)) {
		try {
			const data = fs.readFileSync(dockerFileName, 'UTF-8');
			const lines = data.split(/\r?\n/);
			lines.forEach((line) => {
				const splittedLine = line.split("=");
				if (splittedLine.length === 2) {
					const envName = splittedLine[0];
					if (envName.slice(-20) === "MASTER_DEVICE_HASHES") {
						const envValues = splittedLine[1].replace(/"/g,"").split(",");
						process_env.MASTER_DEVICE_HASHES.push(envValues);
					} else {
						const envValue = splittedLine[1].replace(/"/g,"");
						process_env[envName] = envValue;
					}
				}
			});

		} catch (err) {
			logger.log("error",  `An error occurred while trying to read the file: ${dockerFileName}:  %s`, err.message);
		}
	}
};

readDockerFiles("/run/secrets/admin_api.txt");
readDockerFiles("/run/secrets/master_devices.txt");
readDockerFiles("/run/configs/admin_api.conf");


export default process_env;

