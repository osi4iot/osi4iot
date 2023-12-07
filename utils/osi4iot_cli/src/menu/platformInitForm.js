import fs from 'fs';
import os from 'os';
import validUrl from 'valid-url';
import needle from 'needle';
import timezoneValidator from 'timezone-validator';
import { nanoid } from 'nanoid';
import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import clc from "cli-color";
import removeCerts from '../config_tools/removeCerts.js';
import certsGenerator from '../config_tools/certsGenerator.js';
import secretsGenerator from '../config_tools/secretsGenerator.js';
import configGenerator from '../config_tools/configGenerator.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import runStack from './runStack.js';
import inquirer from '../generic_tools/inquirer.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import nodesConfiguration from '../nodes/nodesConfiguration.js';
import generateNodeLabels from '../nodes/generateNodeLabels.js';
import cleanSystemAndVolumes from './cleanSystemAndVolumes.js';
import joinNodesToSwarm from '../nodes/joinNodesToSwarm.js';
import swarmNodesQuestions from '../nodes/swarmNodesQuestions.js';
import { existsCountry } from '../generic_tools/countryCodes.js';
import { chooseOption } from './chooseOption.js';

const platformInitiation = () => {
	const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
	const osi4iotStateInitial = JSON.parse(osi4iotStateText);
	const deploymentMode = osi4iotStateInitial.platformInfo.DEPLOYMENT_MODE;
	const s3BucketType = osi4iotStateInitial.platformInfo.S3_BUCKET_TYPE;
	const deploymentLocation = osi4iotStateInitial.platformInfo.DEPLOYMENT_LOCATION;
	const awsAccessKeyId = osi4iotStateInitial.platformInfo.AWS_ACCESS_KEY_ID;
	const awsSecretAccessKey = osi4iotStateInitial.platformInfo.AWS_SECRET_ACCESS_KEY;
	const awsRegion = osi4iotStateInitial.platformInfo.AWS_REGION;
	const dockerImagesVersion = osi4iotStateInitial.platformInfo.DOCKER_IMAGES_VERSION;
	let mainOrgAdminPassword;

	inquirer
		.prompt([
			{
				name: 'PLATFORM_NAME',
				message: 'Platform name:',
				default: 'OSI-DEMO',
				validate: function (platformName) {
					let valid = /(?!(^xn--|.+-s3alias$))^[a-zA-Z0-9][a-zA-Z0-9-]{2,13}[a-zA-Z0-9]$/.test(platformName);
					if (valid) {
						return true;
					} else {
						return "Invalid platform name:\n    1-) Platform names must be between 4 (min) and 15 (max) characters long.\n    2-) Platform names can consist only of letters, numbers, and hyphens (-).\n    3-) Platform names must not be formatted as an IP address\n    4-) Platform names must not start with the prefix 'xn--'.\n    5-) Platform names must not end with the suffix '-s3alias'.";
					}
				}
			},
			{
				name: 'DOMAIN_NAME',
				message: 'Domain name:'
			},
			{
				name: 'PLATFORM_PHRASE',
				message: 'Platform motivational phrase:',
				default: 'Open source integration for internet of things'
			},
			{
				name: 'PLATFORM_ADMIN_FIRST_NAME',
				message: 'Platform admin first name:',
				validate: function (platformName) {
					if (platformName.length >= 2) {
						return true;
					} else {
						return "Please type at least 2 characters";
					}
				}
			},
			{
				name: 'PLATFORM_ADMIN_SURNAME',
				message: 'Platform admin last name:',
				validate: function (platformName) {
					if (platformName.length >= 2) {
						return true;
					} else {
						return "Please type at least 2 characters";
					}
				}
			},
			{
				name: 'PLATFORM_ADMIN_USER_NAME',
				message: 'Platform admin user name:',
				validate: function (platformName) {
					if (platformName.length >= 6) {
						return true;
					} else {
						return "Please type at least 6 characters";
					}
				}
			},
			{
				name: 'PLATFORM_ADMIN_EMAIL',
				message: 'Platform admin email:',
				validate: function (email) {
					const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
					if (valid) {
						return true;
					} else {
						return "Please type a valid email";
					}
				}
			},
			{
				name: 'PLATFORM_ADMIN_PASSWORD_INI',
				message: 'Platform admin password:',
				type: 'password',
				mask: "*",
				validate: function (password) {
					const valid = /^[a-zA-Z0-9._-]{8,20}$/.test(password);
					if (valid) {
						mainOrgAdminPassword = password;
						return true;
					} else {
						return "Please type a password with 8 to 20 characters which contain only characters, numeric digits, underscore and first character must be a letter";
					}
				}
			},
			{
				name: 'PLATFORM_ADMIN_PASSWORD',
				message: 'Retype platform admin password:',
				type: 'password',
				mask: "*",
				validate: function (password) {
					const valid = /^[a-zA-Z0-9._-]{8,20}$/.test(password);
					if (valid) {
						if (mainOrgAdminPassword === password) {
							return true;
						} else {
							return "The password typed not match with previous one"
						}
					} else {
						return "Please type a password with 8 to 20 characters which contain only characters, numeric digits, underscore and first character must be a letter";
					}
				}
			},
			{
				name: 'NUMBER_OF_SWARM_NODES',
				message: 'Number of nodes in the platform:',
				default: 1,
				when: () => deploymentLocation !== "Local deployment",
				validate: function (numOfNodes) {
					let valid = false;
					if (numOfNodes !== "" && Number.isInteger(Number(numOfNodes)) && Number(numOfNodes) >= 1) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to one";
					}
				}
			},
			{
				name: 'NUMBER_OF_CPUS_PER_NODE',
				message: 'Select the number of CPUs per cluster node:',
				default: '4',
				type: 'list',
				choices: [
					"2",
					"4",
					"8",
					"16"
				],
				validate: function (numCpus) {
					if (numCpus === "2") {
						if (deploymentLocation === "Local deployment") {
							return "For local deployment at least 4 CPUs are required";
						} else {
							return true;
						}
					}
				}
			},
			{
				name: 'RAM_MEMORY_PER_NODE',
				message: 'Select the amount of RAM memory in GiB per cluster node:',
				default: '4',
				type: 'list',
				choices: [
					"4 GiB",
					"8 GiB",
					"16 GiB",
					"32 GiB",
				],
				validate: function (numCpus) {
					if (numCpus === "4 GiB") {
						if (deploymentLocation === "Local deployment") {
							return "For local deployment at least 8 GiB of RAM memory are required";
						} else {
							return true;
						}
					}
				}
			},
			{
				name: 'AWS_EFS_DNS',
				message: 'AWS Elastic File System DNS:',
				when: (answers) => answers.NUMBER_OF_SWARM_NODES > 1 && deploymentLocation === "AWS cluster deployment",
			},
		])
		.then(async (prevAnswers) => {
			let nodesData = [];
			if (deploymentLocation === "Local deployment") {
				const nodeArchitecture = os.arch();
				let nodeArch = "x86_64";
				if (nodeArchitecture === "x64") nodeArch = "x86_64";
				else if (nodeArchitecture === "arm64") nodeArch = "aarch64";
				const whoami = execSync("whoami").toString().replace('\n', '').replace('\r', '').toLowerCase();
				let nodeUserName = whoami;
				if (whoami.includes("\\")) {
					nodeUserName = whoami.split("\\")[1];
				}
				const nodeHostName = execSync("hostname").toString().replace('\n', '').replace('\r', '').toLowerCase();
				nodesData.push({ nodeHostName, nodeIP: "localhost", nodeUserName, nodeRole: "Manager", nodeArch });
			} else {
				let defaultUserName = prevAnswers.PLATFORM_ADMIN_USER_NAME;
				if (deploymentLocation === "AWS cluster deployment") {
					defaultUserName = "ubuntu";
				}
				const numSwarmNodes = prevAnswers.NUMBER_OF_SWARM_NODES;
				if (!(numSwarmNodes > 1 && deploymentLocation === "AWS cluster deployment")) {
					prevAnswers.AWS_EFS_DNS = "";
				}
				const currentNodesData = [];
				nodesData = await swarmNodesQuestions(
					numSwarmNodes,
					currentNodesData,
					defaultUserName,
					deploymentLocation
				);
			}
			const newAnswers = { ...prevAnswers, NODES_DATA: nodesData };
			finalQuestions(
				newAnswers,
				deploymentLocation,
				deploymentMode,
				s3BucketType,
				awsAccessKeyId,
				awsSecretAccessKey,
				awsRegion,
				dockerImagesVersion
			);
		});

}

const finalQuestions = (
	oldAnswers,
	deploymentLocation,
	deploymentMode,
	s3BucketType,
	awsAccessKeyId,
	awsSecretAccessKey,
	awsRegion,
	dockerImagesVersion
) => {
	const nodesData = oldAnswers.NODES_DATA;
	let managerNodes = nodesData.filter(node => node.nodeRole === "Manager");
	const platformName = oldAnswers.PLATFORM_NAME;
	const defaultS3BucketName = platformName.replace(/ /g, "-").replace(/_/g, "-").toLowerCase();

	inquirer
		.prompt([
			{
				name: 'MIN_LONGITUDE',
				message: 'Min longitude of the geographical zone of the platform:',
				default: -10.56884765625,
				validate: function (longitude) {
					let valid = false;
					if (longitude !== "" && typeof (parseFloat(longitude)) === 'number') {
						if (longitude >= -180 && longitude <= 180) valid = true;
					}
					if (valid) {
						return true;
					} else {
						return "Please type a valid longitude";
					}
				}
			},
			{
				name: 'MAX_LONGITUDE',
				message: 'Max longitude of the geographical zone of the platform:',
				default: 1.42822265625,
				validate: function (longitude) {
					let valid = false;
					if (longitude !== "" && typeof (parseFloat(longitude)) === 'number') {
						if (longitude >= -180 && longitude <= 180) valid = true;
					}
					if (valid) {
						return true;
					} else {
						return "Please type a valid longitude";
					}
				}
			},
			{
				name: 'MIN_LATITUDE',
				message: 'Min latitude of the geographical zone of the platform:',
				default: 35.55010533588552,
				validate: function (latitude) {
					let valid = false;
					if (latitude !== "" && typeof (parseFloat(latitude)) === 'number') {
						if (latitude >= -90 && latitude <= 90) valid = true;
					}
					if (valid) {
						return true;
					} else {
						return "Please type a valid latitude";
					}
				}
			},
			{
				name: 'MAX_LATITUDE',
				message: 'Max latitude of the geographical zone of the platform:',
				default: 44.134913443750726,
				validate: function (latitude) {
					let valid = false;
					if (latitude !== "" && typeof (parseFloat(latitude)) === 'number') {
						if (latitude >= -90 && latitude <= 90) valid = true;
					}
					if (valid) {
						return true;
					} else {
						return "Please type a valid latitude";
					}
				}
			},
			{
				name: 'DEFAULT_TIME_ZONE',
				message: 'Default time zone:',
				default: 'Europe/Madrid',
				validate: function (timezone) {
					if (timezoneValidator(timezone)) {
						return true;
					} else {
						return "Please tye a valid timezone";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_NAME',
				message: 'Main organization name:',
				default: 'My main org',
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least 4 characters";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_ACRONYM',
				message: 'Main organization acronym:',
				default: 'MYORG',
				validate: function (text) {
					if (text.length >= 3 && text.length <= 11) {
						return true;
					} else {
						return "Please type between 3 and 11 characters";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_ADDRESS1',
				message: 'Main organization address:',
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid address";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_CITY',
				message: 'Main organization city:',
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid city";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_ZIP_CODE',
				message: 'Main organization zip code:',
				validate: function (text) {
					if (text.length >= 5) {
						return true;
					} else {
						return "Please type at least a valid zip code";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_STATE',
				message: 'Main organization state/province:',
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid state/province";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_COUNTRY',
				message: 'Main organization country:',
				validate: function (country) {
					if (existsCountry(country)) {
						return true;
					} else {
						return "Please type at least a valid country";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_BUILDING',
				message: 'Main organization building:',
				type: 'editor',
			},
			{
				name: 'MAIN_ORGANIZATION_FLOOR',
				message: 'Main organization floor:',
				type: 'editor',
			},
			{
				name: 'TELEGRAM_BOTTOKEN',
				message: 'Telegram boottoken for main organization default group:',
				validate: function (text) {
					if (text.length >= 20) {
						return true;
					} else {
						return "Please type at least a telegram bottoken";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_TELEGRAM_CHAT_ID',
				message: 'Telegram chat id for main organization default group:',
				validate: function (telegramChatId) {
					let valid = false;
					if (telegramChatId !== "" && Number.isInteger(Number(telegramChatId))) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number";
					}
				}
			},
			{
				name: 'MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK',
				message: 'Telegram invitation link for main organization default group:',
				validate: function (url) {
					if (validUrl.isUri(url)) {
						return true;
					} else {
						return "Please type a valid url";
					}
				}
			},
			{
				name: 'NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG',
				message: 'Number of node-red instances in main org:',
				default: 3,
				validate: function (numOfNRI) {
					let valid = false;
					if (numOfNRI !== "" && Number.isInteger(Number(numOfNRI)) && Number(numOfNRI) >= 1) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to one";
					}
				}
			},
			{
				name: 'NOTIFICATIONS_EMAIL_ADDRESS',
				message: 'Email account for platform notifications:',
				validate: function (email) {
					const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
					if (valid) {
						return true;
					} else {
						return "Please type a valid email";
					}
				}
			},
			{
				name: 'NOTIFICATIONS_EMAIL_PASSWORD',
				message: 'Email account password:',
				type: 'password',
				mask: "*",
				validate: function (password) {
					let valid = /^[A-Za-z]\w{8,20}$/.test(password);
					if (valid) {
						return true;
					} else {
						return "Please type a password with 8 to 20 characters which contain only characters, numeric digits, underscore and first character must be a letter";
					}
				}
			},
			{
				name: 'S3_BUCKET_NAME',
				message: 'S3 storage bucket name:',
				default: defaultS3BucketName,
				validate: (s3BucketName) => checkIfBucketNameIsValid(s3BucketName, deploymentLocation)
			},
			{
				name: 'DOMAIN_CERTS_TYPE',
				message: 'Choose the type of domain ssl certs to be used:',
				default: 'Autosigned certs',
				type: 'list',
				choices: [
					"No certs",
					"Certs provided by an CA",
					"Let's encrypt certs and AWS Route 53",
					"AWS Certificate Manager"
				],
				validate: function (selection) {
					if (selection === "No certs") {
						if (deploymentLocation === "Local deployment") {
							return true;
						} else {
							return "No certs case is only allowed for local deployments";
						}
					} else if (selection === "Let's encrypt certs and AWS Route 53") {
						if (deploymentLocation === "AWS cluster deployment") {
							return true;
						} else {
							return "Let's encrypt certs option is only available for AWS cluster deployment";
						}
					} else if (selection === "AWS Certificate Manager") {
						if (deploymentLocation === "AWS cluster deployment") {
							return true;
						} else {
							return "AWS Certificate Manager option is only available for AWS cluster deployment";
						}
					} else if (selection === "Certs provided by an CA") {
						return true;
					}

				}
			},
			{
				name: 'DOMAIN_SSL_PRIVATE_KEY',
				message: 'Domain SSL private key:',
				type: 'editor',
				when: (answers) => answers.DOMAIN_CERTS_TYPE === "Certs provided by an CA"
			},
			{
				name: 'DOMAIN_SSL_CA_CERT',
				message: 'Domain SSL CA certificates only as intermediate(s)/root only, PEM encoded:',
				type: 'editor',
				when: (answers) => answers.DOMAIN_CERTS_TYPE === "Certs provided by an CA"
			},
			{
				name: 'DOMAIN_SSL_CERTICATE',
				message: 'Domain SSL certificate only, PEM encoded:',
				type: 'editor',
				when: (answers) => answers.DOMAIN_CERTS_TYPE === "Certs provided by an CA"
			},
			{
				name: 'AWS_ACCESS_KEY_ID',
				message: 'AWS access key id:',
				type: 'password',
				mask: "*",
				when: (answers) => answers.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53" && awsAccessKeyId === ""
			},
			{
				name: 'AWS_SECRET_ACCESS_KEY',
				message: 'AWS secret access key:',
				type: 'password',
				mask: "*",
				when: (answers) => answers.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53" && awsSecretAccessKey === ""
			},
			{
				name: 'REGISTRATION_TOKEN_LIFETIME',
				message: 'Registration token lifetime in seconds:',
				default: 86400,
				validate: function (tokenLifeTime) {
					let valid = false;
					// if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 3600) valid = true;
					if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 0) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to 3600";
					}
				}
			},
			{
				name: 'ACCESS_TOKEN_LIFETIME',
				message: 'Access token lifetime in seconds:',
				default: 604800,
				validate: function (tokenLifeTime) {
					let valid = false;
					// if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 3600) valid = true;
					if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 0) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to 3600";
					}
				}
			},
			{
				name: 'REFRESH_TOKEN_LIFETIME',
				message: 'Refresh token lifetime in seconds:',
				default: 31536000,
				validate: function (tokenLifeTime) {
					let valid = false;
					// if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 86400) valid = true;
					if (tokenLifeTime !== "" && Number(tokenLifeTime) >= 0) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to 86400";
					}
				}
			},
			{
				name: 'MQTT_SSL_CERTS_VALIDITY_DAYS',
				message: 'Mqtt ssl certs validity days:',
				default: 365,
				validate: function (validityDays) {
					let valid = false;
					if (validityDays !== "" && Number(validityDays) >= 30) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to 30";
					}
				}
			},
			{
				name: 'TIMESCALE_DATA_RET_INT_DAYS',
				message: 'Data retention interval in days for timescaldb:',
				default: 7,
				validate: function (validityDays) {
					let valid = false;
					if (validityDays !== "" && Number(validityDays) >= 1) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to 1";
					}
				}
			},
			{
				name: 'FLOATING_IP_ADDRES',
				message: 'Floating IP address:',
				when: () => managerNodes.length > 1 && deploymentLocation === "On-premise cluster deployment",
				validate: function (ipAddress) {
					const valid = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipAddress)
					if (valid) {
						return true;
					} else {
						return "Please type a valid IP address";
					}
				}
			},
			{
				name: 'NETWORK_INTERFACE',
				message: 'Manager nodes network interface:',
				default: 'eth0',
				when: () => managerNodes.length > 1 && deploymentLocation === "On-premise cluster deployment",
				validate: function (networkInterface) {
					if (networkInterface.length >= 4) {
						return true;
					} else {
						return "Please type at least 4 characters";
					}
				}
			},
		])
		.then((newAnswers) => {
			const answers = { ...oldAnswers, ...newAnswers };
			console.log("");
			inquirer
				.prompt([
					{
						type: 'confirm',
						name: 'confirmation',
						message: 'Confirm that all the above answers are correct',
					},
				])
				.then(async (confirmationAnswer) => {
					if (!confirmationAnswer.confirmation) {
						console.log("");
						platformInitiation();
					} else {
						if (answers.DOMAIN_CERTS_TYPE === "No certs") {
							answers.DOMAIN_SSL_PRIVATE_KEY = "";
							answers.DOMAIN_SSL_CA_CERT = "";
							answers.DOMAIN_SSL_CERTICATE = "";
							answers.AWS_ACCESS_KEY_ID = "";
							answers.AWS_SECRET_ACCESS_KEY = "";
						} else if (answers.DOMAIN_CERTS_TYPE === "Certs provided by an CA") {
							answers.AWS_ACCESS_KEY_ID = "";
							answers.AWS_SECRET_ACCESS_KEY = "";
						} else if (answers.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
							answers.DOMAIN_SSL_PRIVATE_KEY = "";
							answers.DOMAIN_SSL_CA_CERT = "";
							answers.DOMAIN_SSL_CERTICATE = "";
							if (awsAccessKeyId === "") awsAccessKeyId = answers.AWS_ACCESS_KEY_ID;
							if (awsSecretAccessKey === "") awsSecretAccessKey = answers.AWS_SECRET_ACCESS_KEY;
						}

						const osi4iotState = {
							platformInfo: {
								DOCKER_IMAGES_VERSION: dockerImagesVersion,
								DEPLOYMENT_MODE: deploymentMode,
								DEPLOYMENT_LOCATION: deploymentLocation,
								S3_BUCKET_TYPE: s3BucketType,
								AWS_ACCESS_KEY_ID: awsAccessKeyId,
								AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
								AWS_EFS_DNS: answers.AWS_EFS_DNS,
								AWS_REGION: awsRegion,
								S3_BUCKET_NAME: answers.S3_BUCKET_NAME,
								PLATFORM_NAME: answers.PLATFORM_NAME,
								DOMAIN_NAME: answers.DOMAIN_NAME,
								DOMAIN_CERTS_TYPE: answers.DOMAIN_CERTS_TYPE,
								PLATFORM_PHRASE: answers.PLATFORM_PHRASE,
								PLATFORM_ADMIN_FIRST_NAME: answers.PLATFORM_ADMIN_FIRST_NAME,
								PLATFORM_ADMIN_SURNAME: answers.PLATFORM_ADMIN_SURNAME,
								PLATFORM_ADMIN_USER_NAME: answers.PLATFORM_ADMIN_USER_NAME,
								PLATFORM_ADMIN_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
								PLATFORM_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								RAM_MEMORY_PER_NODE: answers.RAM_MEMORY_PER_NODE,
								NUMBER_OF_CPUS_PER_NODE: answers.NUMBER_OF_CPUS_PER_NODE,
								NODES_DATA: answers.NODES_DATA,
								MIN_LONGITUDE: answers.MIN_LONGITUDE,
								MAX_LONGITUDE: answers.MAX_LONGITUDE,
								MIN_LATITUDE: answers.MIN_LATITUDE,
								MAX_LATITUDE: answers.MAX_LATITUDE,
								DEFAULT_TIME_ZONE: answers.DEFAULT_TIME_ZONE,
								MAIN_ORGANIZATION_NAME: answers.MAIN_ORGANIZATION_NAME,
								MAIN_ORGANIZATION_ACRONYM: answers.MAIN_ORGANIZATION_ACRONYM,
								MAIN_ORGANIZATION_ADDRESS1: answers.MAIN_ORGANIZATION_ADDRESS1,
								MAIN_ORGANIZATION_CITY: answers.MAIN_ORGANIZATION_CITY,
								MAIN_ORGANIZATION_ZIP_CODE: answers.MAIN_ORGANIZATION_ZIP_CODE,
								MAIN_ORGANIZATION_STATE: answers.MAIN_ORGANIZATION_STATE,
								MAIN_ORGANIZATION_COUNTRY: answers.MAIN_ORGANIZATION_COUNTRY,
								MAIN_ORGANIZATION_BUILDING: answers.MAIN_ORGANIZATION_BUILDING,
								MAIN_ORGANIZATION_FLOOR: answers.MAIN_ORGANIZATION_FLOOR,
								TELEGRAM_BOTTOKEN: answers.TELEGRAM_BOTTOKEN,
								MAIN_ORGANIZATION_TELEGRAM_CHAT_ID: answers.MAIN_ORGANIZATION_TELEGRAM_CHAT_ID,
								MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK: answers.MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK,
								NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG: parseInt(answers.NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG, 10),
								NOTIFICATIONS_EMAIL_USER: answers.NOTIFICATIONS_EMAIL_ADDRESS,
								NOTIFICATIONS_EMAIL_ADDRESS: answers.NOTIFICATIONS_EMAIL_ADDRESS,
								NOTIFICATIONS_EMAIL_PASSWORD: answers.NOTIFICATIONS_EMAIL_PASSWORD,
								REGISTRATION_TOKEN_LIFETIME: answers.REGISTRATION_TOKEN_LIFETIME,
								REFRESH_TOKEN_LIFETIME: answers.REFRESH_TOKEN_LIFETIME,
								REFRESH_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
								ACCESS_TOKEN_SECRET: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
								ACCESS_TOKEN_LIFETIME: answers.ACCESS_TOKEN_LIFETIME,
								MQTT_SSL_CERTS_VALIDITY_DAYS: parseInt(answers.MQTT_SSL_CERTS_VALIDITY_DAYS, 10),
								FLOATING_IP_ADDRES: answers.FLOATING_IP_ADDRES || '127.0.0.1',
								NETWORK_INTERFACE: answers.NETWORK_INTERFACE || 'eth0',
								ENCRYPTION_SECRET_KEY: nanoid(32).replace(/-/g, "x").replace(/_/g, "X"),
								GRAFANA_ADMIN_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								POSTGRES_USER: answers.PLATFORM_ADMIN_USER_NAME,
								POSTGRES_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								POSTGRES_DB: "iot_platform_db",
								TIMESCALE_USER: answers.PLATFORM_ADMIN_USER_NAME,
								TIMESCALE_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								TIMESCALE_DB: "iot_data_db",
								TIMESCALE_DATA_RETENTION_INTERVAL: `${answers.TIMESCALE_DATA_RET_INT_DAYS} days`,
								GRAFANA_DB_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
								GRAFANA_DATASOURCE_PASSWORD: nanoid(20).replace(/-/g, "x").replace(/_/g, "X"),
								DEV2PDB_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								NODE_RED_ADMIN: answers.PLATFORM_ADMIN_USER_NAME,
								NODE_RED_ADMIN_HASH: bcrypt.hashSync(answers.PLATFORM_ADMIN_PASSWORD, 8),
								PGADMIN_DEFAULT_EMAIL: answers.PLATFORM_ADMIN_EMAIL,
								PGADMIN_DEFAULT_PASSWORD: answers.PLATFORM_ADMIN_PASSWORD,
								NODES_DATA: answers.NODES_DATA,
							},
							certs: {
								domain_certs: {
									private_key: answers.DOMAIN_SSL_PRIVATE_KEY,
									iot_platform_key_name: "",
									ssl_ca_pem: answers.DOMAIN_SSL_CA_CERT,
									iot_platform_ca_name: "",
									ssl_cert_crt: answers.DOMAIN_SSL_CERTICATE,
									iot_platform_cert_name: "",
									ca_pem_expiration_timestamp: 0,
									cert_crt_expiration_timestamp: 0,
								},
								mqtt_certs: {
									ca_certs: {
										ca_crt: "",
										mqtt_certs_ca_cert_name: "",
										ca_key: "",
										mqtt_certs_ca_key_name: "",
										expiration_timestamp: 0
									},
									broker: {
										server_crt: "",
										mqtt_broker_cert_name: "",
										server_key: "",
										mqtt_broker_key_name: "",
										expiration_timestamp: 0
									},
									organizations: []
								}
							}
						}

						osi4iotState.certs.mqtt_certs.organizations[0] = {
							org_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
							org_acronym: answers.MAIN_ORGANIZATION_ACRONYM.toLowerCase(),
							exclusiveWorkerNodes: [],
							nodered_instances: []
						}
						for (let inri = 1; inri <= answers.NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG; inri++) {
							osi4iotState.certs.mqtt_certs.organizations[0].nodered_instances[inri - 1] = {
								client_crt: "",
								client_key: "",
								expiration_timestamp: 0,
								nri_hash: nanoid(10).replace(/-/g, "x").replace(/_/g, "X"),
								is_volume_created: 'false'
							}
							osi4iotState.certs.mqtt_certs.organizations[0].nodered_instances[inri - 1].client_crt_name = "";
							osi4iotState.certs.mqtt_certs.organizations[0].nodered_instances[inri - 1].client_key_name = "";
						}

						try {
							console.log(clc.green('\nConfigurating nodes in the cluster...'));
							const organizations = osi4iotState.certs.mqtt_certs.organizations;
							const awsData = {
								email: answers.PLATFORM_ADMIN_EMAIL,
								domainName: answers.DOMAIN_NAME,
								domainCertsType: answers.DOMAIN_CERTS_TYPE,
								awsAccessKeyId,
								awsSecretAccessKey,
								efsDNS: answers.AWS_EFS_DNS
							}

							nodesConfiguration(answers.NODES_DATA, organizations, deploymentLocation, awsData);

							console.log(clc.green('\nJoining nodes to swarm:'));
							await joinNodesToSwarm(answers.NODES_DATA, deploymentLocation);

							console.log(clc.green('\nRemoving previous docker images and volumes...'));
							cleanSystemAndVolumes(answers.NODES_DATA);

							console.log(clc.green('\nCreating certificates...'));
							removeCerts(osi4iotState);
							await certsGenerator(osi4iotState);
							const osi4iotStateFile = JSON.stringify(osi4iotState);
							fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

							console.log(clc.green('Creating secrets...'))
							secretsGenerator(osi4iotState);
							console.log(clc.green('Creating configs...'))
							configGenerator(osi4iotState);
							console.log(clc.green('Creating stack file...\n'))
							stackFileGenerator(osi4iotState);

							const nodesData = osi4iotState.platformInfo.NODES_DATA;
							const dockerHost = findManagerDockerHost(nodesData);
							console.log(clc.green('Generating node labels...\n'))
							generateNodeLabels(osi4iotState, dockerHost);
							await runStack(osi4iotState, dockerHost);
						} catch (error) {
							console.log(clc.redBright(error));
						}
					}
				});

		})
		.catch((error) => {
			if (error.isTtyError) {
				console.log("Prompt couldn't be rendered in the current environment")
			} else {
				console.log("Error in osi4iot cli: ", error)
			}
		})
}

export default async function () {
	if (fs.existsSync('./osi4iot_state.json')) {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);

		if (osi4iotState.platformInfo.NODES_DATA !== undefined && osi4iotState.platformInfo.NODES_DATA.length !== 0) {
			inquirer
				.prompt([{
					name: 'confirm_platform_initiation',
					type: 'confirm',
					message: 'An state file already exits. Do you want to reinitate the platform anyway?',
				}
				])
				.then((answers) => {
					if (answers.confirm_platform_initiation) platformInitiation();
					else chooseOption();
				})
				.catch((error) => {
					if (error.isTtyError) {
						console.log("Prompt couldn't be rendered in the current environment")
					} else {
						console.log("Error in osi4iot cli: ", error)
					}
				});
		} else {
			platformInitiation();
		}
	} else {
		platformInitiation();
	}
}

const checkIfBucketNameIsValid = async (s3BucketName, deploymentLocation) => {
	let valid = /(?!(^xn--|.+-s3alias$))^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(s3BucketName);
	if (valid) {
		if (deploymentLocation === "AWS cluster deployment" || true) {
			const urlAwsS3Bucket = `http://${s3BucketName}.s3.amazonaws.com`;
			const existBucket = await needle('get', urlAwsS3Bucket)
				.then((res) => {
					if (res.statusCode === 404) return false;
					else if (res.statusCode === 403) return true;
					else throw error;
				})
				.catch(err => console.log("Can not find out if bucket exists: %s", err.message));
			if (existBucket) {
				return `A bucket with the name: ${s3BucketName} already exist in AWS.`
			} else return true;
		} else return true;
	} else {
		return "Invalid bucket name:\n    1-) Bucket names must be between 3 (min) and 63 (max) characters long.\n    2-) Bucket names can consist only of lowercase letters, numbers, and hyphens (-).\n    3-) Bucket names must not be formatted as an IP address\n    4-) Bucket names must not start with the prefix 'xn--'.\n    5-) Bucket names must not end with the suffix '-s3alias'.";
	}
}


