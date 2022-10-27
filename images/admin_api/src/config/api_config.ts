import fs from "fs";
import { logger } from "./winston";

interface IProcessEnv extends Record<string, string | string[] | string[][]> {
	PLATFORM_NAME: string;
	PROTOCOL: string;
	DOMAIN_NAME: string;
	DEPLOYMENT_LOCATION: string;
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
	GRAFANA_ADMIN_PASSWORD: string;
	POSTGRES_USER: string;
	POSTGRES_PASSWORD: string;
	POSTGRES_DB: string;
	S3_BUCKET_NAME: string;
	AWS_ACCESS_KEY_ID: string;
	AWS_SECRET_ACCESS_KEY: string;
	AWS_REGION: string;
	DEV2PDB_PASSWORD: string;
	NOTIFICATIONS_EMAIL_USER: string;
	NOTIFICATIONS_EMAIL_PASSWORD: string;
	MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: string;
	MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: string;
	TELEGRAM_BOTTOKEN: string;
	MAIN_ORG_HASH: string;
	MAIN_ORG_NODERED_INSTANCE_HASHES: string[];
	REPLICA: string;
}

const process_env: IProcessEnv = {
	PLATFORM_NAME: process.env.PLATFORM_NAME,
	PROTOCOL: process.env.PROTOCOL || "https",
	DOMAIN_NAME: process.env.DOMAIN_NAME,
	DEPLOYMENT_LOCATION: process.env.DEPLOYMENT_LOCATION,
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
	GRAFANA_ADMIN_PASSWORD: process.env.GRAFANA_ADMIN_PASSWORD,
	POSTGRES_USER: process.env.POSTGRES_USER,
	POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
	POSTGRES_DB: process.env.POSTGRES_DB,
	S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
	AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
	AWS_REGION: process.env.AWS_REGION,
	DEV2PDB_PASSWORD: process.env.DEV2PDB_PASSWORD,
	NOTIFICATIONS_EMAIL_USER: process.env.NOTIFICATIONS_EMAIL_USER,
	NOTIFICATIONS_EMAIL_PASSWORD: process.env.NOTIFICATIONS_EMAIL_PASSWORD,
	MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: process.env.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
	MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: process.env.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
	TELEGRAM_BOTTOKEN: process.env.TELEGRAM_BOTTOKEN,
	MAIN_ORG_HASH: process.env.MAIN_ORG_HASH,
	MAIN_ORG_NODERED_INSTANCE_HASHES: [],
	REPLICA: process.env.REPLICA,
};

const readDockerFiles = (dockerFileName: string) => {
	if (fs.existsSync(dockerFileName)) {
		try {
			const data = fs.readFileSync(dockerFileName, {encoding:'utf8', flag:'r'});
			const lines = data.split(/\r?\n/);
			lines.forEach((line) => {
				const splittedLine = line.split("=");
				if (splittedLine.length === 2) {
					const envName = splittedLine[0];
					if (envName === "MAIN_ORG_NODERED_INSTANCE_HASHES") {
						const envValues = splittedLine[1].replace(/"/g, "").split(",");
						process_env.MAIN_ORG_NODERED_INSTANCE_HASHES.push(...envValues);
					} else {
						const envValue = splittedLine[1].replace(/"/g, "");
						process_env[envName] = envValue;
					}
				}
			});

		} catch (err) {
			logger.log("error", `An error occurred while trying to read the file: ${dockerFileName}:  %s`, err.message);
		}
	}
};

readDockerFiles("/run/secrets/admin_api.txt");
readDockerFiles("/run/configs/admin_api.conf");


export default process_env;

