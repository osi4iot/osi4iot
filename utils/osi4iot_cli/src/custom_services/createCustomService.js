import fs from 'fs';
import inquirer from 'inquirer';
import { nanoid } from 'nanoid';
import clc from 'cli-color';
import { chooseOption } from '../menu/chooseOption.js';
import getOrganizations from '../organizations/getOrganizations.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import customServiceConfigFile from './customServiceConfigFile.js';
import customServiceSecretFile from './customServiceSecretFile.js';
import runStack from '../menu/runStack.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		if (osi4iotState.custom_services === undefined) {
			osi4iotState.custom_services = [];
			const osi4iotStateFile = JSON.stringify(osi4iotState);
			fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
		}

		const orgs = await getOrganizations();
		const orgsAcronym = orgs.map(org => org.acronym);
		if (orgs.length !== 0) {
			const csvsUid = nanoid(16).replace(/-/g, "x").replace(/_/g, "X");
			inquirer
				.prompt([
					{
						name: 'ORG_ACRONYM',
						message: 'Organization acronym:',
						type: 'list',
						default: orgsAcronym[0],
						choices: orgsAcronym,
					},
					{
						name: 'SERVICE_NAME',
						message: 'Service name:',
						default: "new_custom_service",
						validate: function (text) {
							if (text.length >= 4) {
								const existsName = osi4iotState.custom_services.filter(
									csv => csv.serviceName === text
								).length !== 0;
								if (existsName) {
									return `Already exists a custom service with name ${text}`;
								} else {
									return true;
								}

							} else {
								return "Please type at least 4 characters";
							}
						}
					},
					{
						name: 'DOCKER_IMAGE',
						message: 'Docker image:',
						validate: function (text) {
							if (text.length >= 4) {
								return true;
							} else {
								return "Please type at least 4 characters";
							}
						}
					},
					{
						name: 'CPU_REQ',
						message: 'CPU required:',
						validate: function (cpu_req) {
							let valid = false;
							if (cpu_req !== "" && Number(cpu_req) >= 0.25) valid = true;
							if (valid) {
								return true;
							} else {
								return "The minimum cpu is 0.25";
							}
						}
					},
					{
						name: 'MEMORY_REQ',
						message: 'Memory required (Mb):',
						validate: function (ram_req) {
							let valid = false;
							if (ram_req !== "" && Number(ram_req) >= 250) valid = true;
							if (valid) {
								return true;
							} else {
								return "The minimum RAM memory is 250Mb";
							}
						}
					},
					{
						name: 'VOLUME_NAME',
						message: 'Volume name:',
						default: `vol_${csvsUid}`,
						validate: function (volumeName) {
							if (!volumeName.includes(" ")) {
								return true;
							} else {
								return "Volume name can not contain white spaces";
							}
						}
					},
					{
						name: 'VOLUME_PATH',
						message: 'Volume path in container:',
						default: "/data",
						validate: function (volumePath) {
							if (!volumePath.includes(" ") && Array.from(volumePath)[0] === "/") {
								return true;
							} else {
								return "The volume path cannot contain whitespace and must begin with the / character";
							}
						}
					},
					{
						name: 'NEED_CONFIG_FILE',
						message: 'Is needed a configuration file?',
						default: "Yes",
						choices: ["Yes", "No"],
					},
					{
						name: 'CONFIG_DATA',
						message: 'Config data:',
						type: 'editor',
						when: (answers) => answers.NEED_CONFIG_FILE === "Yes",
					},
					{
						name: 'NEED_SECRET_FILE',
						message: 'Is needed a secret file?',
						default: "Yes",
						choices: ["Yes", "No"],
					},
					{
						name: 'SECRETS_DATA',
						message: 'Secrets data:',
						type: 'editor',
						when: (answers) => answers.NEED_SECRET_FILE === "Yes",
					},
				])
				.then(async (answers) => {
					const newCustomService = {
						orgId: orgs.filter(org => org.acronym === answers.ORG_ACRONYM)[0].id,
						orgAcronym: answers.ORG_ACRONYM,
						serviceName: answers.SERVICE_NAME,
						serviceRef: `csvc_${csvsUid}`,
						dockerImage: answers.DOCKER_IMAGE,
						cpuRequired: answers.CPU_REQ,
						memRequired: answers.MEMORY_REQ,
						volumeName: answers.VOLUME_NAME,
						volumePath: answers.VOLUME_PATH,
						configData: answers.NEED_CONFIG_FILE === "Yes" ? answers.CONFIG_DATA : "",
						secretData: answers.NEED_SECRET_FILE === "Yes" ? answers.SECRETS_DATA : "",
					}
					osi4iotState.custom_services.push(newCustomService);
					const osi4iotStateFile = JSON.stringify(osi4iotState);
					fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

					if (newCustomService.configData !== "") {
						customServiceConfigFile("CREATE_OR_UPDATE", newCustomService);
					}

					if (newCustomService.secretData !== "") {
						customServiceSecretFile("CREATE_OR_UPDATE", newCustomService);
					}
					
					console.log(clc.green('\nCreating stack file...\n'));
					stackFileGenerator(osi4iotState);

					const nodesData = osi4iotState.platformInfo.NODES_DATA;
					const dockerHost = findManagerDockerHost(nodesData);
					await runStack(osi4iotState, dockerHost);

				})
				.catch((error) => {
					if (error.isTtyError) {
						console.log("Prompt couldn't be rendered in the current environment");
					} else {
						console.log("Error in osi4iot cli: ", error)
					}
				})
		} else {
			console.log("\n");
			chooseOption();
		}
	}
}