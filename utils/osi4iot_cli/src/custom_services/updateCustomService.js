import fs from 'fs';
import inquirer from 'inquirer';
import clc from "cli-color";
import Table from 'cli-table3';
import { chooseOption } from '../menu/chooseOption.js';
import runStack from '../menu/runStack.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import customServiceConfigFile from './customServiceConfigFile.js';
import customServiceSecretFile from './customServiceSecretFile.js';
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

        if (osi4iotState.custom_services.length === 0) {
            console.log(clc.yellowBright("No custom service has been defined."));
            console.log("\n");
            chooseOption();
        } else {
            const table = new Table({
                head: [
                    clc.cyanBright('Service Ref'),
                    clc.cyanBright('Service name'),
                    clc.cyanBright('Org acronym'),
                    clc.cyanBright('Docker image'),
                    clc.cyanBright('CPU'),
                    clc.cyanBright('RAM'),
                    clc.cyanBright('Volume name'),
                    clc.cyanBright('Volume path'),
                    clc.cyanBright('Config file'),
                    clc.cyanBright('Secret file'),
                ],
                colWidths: [25, 20, 10, 20, 7, 7, 25, 20, 9, 9],
                wordWrap: true,
                style: { 'padding-left': 1, 'padding-right': 1 }
            });

            const services = osi4iotState.custom_services;

            for (let isvc = 0; isvc < services.length; isvc++) {
                const configData = services[isvc].configData !== "" ? "Yes" : "No";
                const secretData = services[isvc].secretData !== "" ? "Yes" : "No";

                const row = [
                    services[isvc].serviceRef,
                    services[isvc].serviceName,
                    services[isvc].orgAcronym,
                    services[isvc].dockerImage,
                    services[isvc].cpuRequired,
                    services[isvc].memRequired,
                    services[isvc].volumeName,
                    services[isvc].volumePath,
                    configData,
                    secretData,
                ];
                table.push(row);
            }

            console.log(table.toString());

            console.log("\n");
			inquirer
				.prompt([
					{
						name: "serviceRef",
						message: "Select the reference of the custom service you want to update:",
						validate: function (csvsRef) {
							if (services.filter(csvc => csvc.serviceRef === csvsRef).length !== 0) {
								return true;
							} else {
								return "Please type a custom service reference of the above table";
							}
						}
					}
				])
                .then( (answers) => {
                    const customServiceToUpdate = osi4iotState.custom_services.filter(
                        csvc => csvc.serviceRef === answers.serviceRef
                    )[0];
                    updateCustomServiceQuestions(osi4iotState, customServiceToUpdate);
                });
            
		}
    }
}

const updateCustomServiceQuestions = (osi4iotState, customServiceToUpdate) => {
    console.log("customServiceToUpdate=", customServiceToUpdate)
    const currenServiceRef = customServiceToUpdate.serviceRef;
	inquirer
		.prompt([
            {
                name: 'SERVICE_NAME',
                message: 'Service name:',
                default: customServiceToUpdate.serviceName,
                validate: function (text) {
                    if (text.length >= 4) {
                        const existsName = osi4iotState.custom_services.filter(
                            csv => csv.serviceName === text && csv.serviceRef !== currenServiceRef
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
                default: customServiceToUpdate.dockerImage,
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
                default: customServiceToUpdate.cpuRequired,
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
                default: customServiceToUpdate.memRequired,
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
                default: customServiceToUpdate.volumeName,
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
                default: customServiceToUpdate.volumePath,
                validate: function (volumePath) {
                    if (!volumePath.includes(" ") && Array.from(volumePath)[0] === "/") {
                        return true;
                    } else {
                        return "The volume path cannot contain whitespace and must begin with the / character";
                    }
                }
            },
            {
                name: 'UPDATE_CONFIG_FILE',
                message: 'Is needed to update the configuration file?',
                default: "No",
                choices: ["Yes", "No"],
            },
            {
                name: 'CONFIG_DATA',
                message: 'Config data:',
                type: 'editor',
                when: (answers) => answers.UPDATE_CONFIG_FILE === "Yes",
            },
            {
                name: 'UPDATE_SECRET_FILE',
                message: 'Is needed to update the secret file?',
                default: "No",
                choices: ["Yes", "No"],
            },
            {
                name: 'SECRETS_DATA',
                message: 'Secrets data:',
                type: 'editor',
                when: (answers) => answers.UPDATE_SECRET_FILE === "Yes",
            },
		])
		.then(async (answers) => {
            const updatedCustomService = {
                orgId: customServiceToUpdate.orgId,
                orgAcronym: customServiceToUpdate.orgId,
                serviceName: answers.SERVICE_NAME,
                serviceRef: customServiceToUpdate.serviceRef,
                dockerImage: answers.DOCKER_IMAGE,
                cpuRequired: answers.CPU_REQ,
                memRequired: answers.MEMORY_REQ,
                volumeName: answers.VOLUME_NAME,
                volumePath: answers.VOLUME_PATH,
                configData: answers.UPDATE_CONFIG_FILE === "Yes" ? answers.CONFIG_DATA : customServiceToUpdate.CONFIG_DATA,
                secretData: answers.UPDATE_SECRET_FILE === "Yes" ? answers.SECRETS_DATA : customServiceToUpdate.SECRETS_DATA,
            }

            osi4iotState.custom_services = osi4iotState.custom_services.map(
                csvc => csvc.serviceRef === currenServiceRef ? updatedCustomService : csvc
            );
            const osi4iotStateFile = JSON.stringify(osi4iotState);
            fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

            if (updatedCustomService.configData !== customServiceToUpdate.configData) {
                customServiceConfigFile("CREATE_OR_UPDATE", updatedCustomService);
            }

            if (updatedCustomService.secretData !== customServiceToUpdate.secretData) {
                customServiceSecretFile("CREATE_OR_UPDATE", updatedCustomService);
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
}