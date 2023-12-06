import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import execShellCommand from '../generic_tools/execShellCommand.js';
import checkCertsValidity from '../config_tools/checkCertsValidity.js';
import checkIfSecretsAreCreated from '../config_tools/checkIfSecretsAreCreated.js';
import checkIfConfigsAreCreated from '../config_tools/checkIfConfigsAreCreated.js';
import secretsGenerator from '../config_tools/secretsGenerator.js';
import configGenerator from '../config_tools/configGenerator.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import checkIfAllNodeRedInstanceVolumesAreCreated from '../config_tools/checkIfAllNodeRedInstanceVolumesAreCreated.js';
import markAsCreatedAllNodeRedInstanceVolumes from '../config_tools/markAsCreatedAllNodeRedInstanceVolumes.js';
import certsGenerator from '../config_tools/certsGenerator.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import { chooseOption } from './chooseOption.js';
import pruneSystemAndVolumes from './pruneSystemAndVolumes.js';
import clearScreen from './clearScreen.js';
import checkFrontendConfigFile from '../config_tools/checkFrontendConfigFile.js';

const dots = [
	"       ",
	".      ",
	"..     ",
	"...    ",
	"....   ",
	".....  ",
	"...... ",
	".......",
];

export default async function (osi4iotState = null, dockerHost = null, runInBackground = false) {
	if (!osi4iotState) {
		if (!fs.existsSync('./osi4iot_state.json')) {
			console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
			return;
		} else {
			const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
			osi4iotState = JSON.parse(osi4iotStateText);
			const nodesData = osi4iotState.platformInfo.NODES_DATA
			const numSwarmNodes = nodesData.length;
			if (nodesData && numSwarmNodes !== 0) {
				if (!dockerHost) {
					dockerHost = findManagerDockerHost(nodesData);
				}

				let osi4iotStateFileNeedToBeUpdated = false;
				let certsUpdateIsNeedeed = false;
				try {
					certsUpdateIsNeedeed = checkCertsValidity(osi4iotState);
				} catch (error) {
					console.log(clc.redBright(error));
					return;
				}

				if (certsUpdateIsNeedeed) {
					console.log(clc.green('\nUpdating certificates...'))
					await certsGenerator(osi4iotState);
					osi4iotStateFileNeedToBeUpdated = true;
				}

				const areSecretsCreated = checkIfSecretsAreCreated(osi4iotState);
				if (!areSecretsCreated) {
					console.log(clc.green('Creating secrets...'))
					secretsGenerator(osi4iotState);
					osi4iotStateFileNeedToBeUpdated = true;
				}

				const areConfigsCreated = checkIfConfigsAreCreated();
				if (!areConfigsCreated) {
					console.log(clc.green('Creating configs...'))
					configGenerator(osi4iotState);
					osi4iotStateFileNeedToBeUpdated = true;
				}

				checkFrontendConfigFile(osi4iotState);

				console.log(clc.green('Creating stack file...\n'))
				stackFileGenerator(osi4iotState);

				if (osi4iotStateFileNeedToBeUpdated) {
					const osi4iotStateFile = JSON.stringify(osi4iotState);
					fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
				}
			}

		}
	}

	if (osi4iotState.platformInfo.NODES_DATA && osi4iotState.platformInfo.NODES_DATA.length !== 0) {
		const nodesData = osi4iotState.platformInfo.NODES_DATA
		const numSwarmNodes = nodesData.length;
		const deploymentMode = osi4iotState.platformInfo.DEPLOYMENT_MODE;
		let encryption = "";
		if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION === "On-premise cluster deployment") {
			encryption = "-o encrypted=true";
		}

		const networks = execSync(`docker ${dockerHost} network ls`);
		if (networks.toString().indexOf("traefik_public") === -1) {
			execSync(`docker ${dockerHost} network create -d overlay ${encryption} traefik_public`);
		}

		if (
			networks.toString().indexOf("agent_network") === -1 &&
			numSwarmNodes > 1 &&
			deploymentMode === "development"
		) {
			execSync(`docker ${dockerHost} network create -d overlay ${encryption} agent_network`);
		}

		if (networks.toString().indexOf("internal_net") === -1) {
			execSync(`docker ${dockerHost} network create -d overlay ${encryption} internal_net`);
		}

		process.stdout.write('\u001B[?25l');
		console.log(clc.green("Deploying docker swarm stack:"));
		let options = {};
		if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION === "AWS cluster deployment") {
			options.env = {
				AWS_ACCESS_KEY_ID: osi4iotState.platformInfo.AWS_ACCESS_KEY_ID,
				AWS_SECRET_ACCESS_KEY: osi4iotState.platformInfo.AWS_SECRET_ACCESS_KEY,
			}
		}
		execShellCommand(`docker ${dockerHost} stack deploy --resolve-image changed --prune -c osi4iot_stack.yml osi4iot`, options)
			.then(() => {
				return new Promise(function (resolve, reject) {
					let index = 0
					setInterval(function () {
						process.stdout.write(`\rWaiting until all services be ready ${dots[index]}`);
						index = index < (dots.length - 1) ? index + 1 : 0;
						let text;
						try {
							text = execSync(`docker ${dockerHost} service ls`).toString();
						} catch (err) {
							reject("Error listing docker services.")
						}
						const services = text.split('\n').filter(line => !line.includes("osi4iot_system_prune")).join('\n');
						let continuar = services.includes(" 0/1 ") ||
							services.includes(" 0/2 ") ||
							services.includes(" 1/2 ") ||
							services.includes(" 0/3 ") ||
							services.includes(" 1/3 ") ||
							services.includes(" 2/3 ");
						if (!continuar) {
							clearInterval(this);
							if (!checkIfAllNodeRedInstanceVolumesAreCreated(osi4iotState)) {
								markAsCreatedAllNodeRedInstanceVolumes(osi4iotState);
								const osi4iotStateFile = JSON.stringify(osi4iotState);
								fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
								stackFileGenerator(osi4iotState);
								resolve("Redeploy stack")
							} else {
								console.log("\nRemoving unused containers, volumes and images.");
								pruneSystemAndVolumes(osi4iotState.platformInfo.NODES_DATA);
								console.log(clc.greenBright("\nOSI4IOT platform is ready to be used !!!\n"));
								process.stdout.write('\u001B[?25h');
								resolve("Finish");
							}
						}
					}, 1000);
				})
			})
			.then((command) => {
				if (command === "Redeploy stack") {
					console.log(clc.green("\n\nRedeploy stack for early created volumes"));
					execShellCommand(`docker ${dockerHost} stack deploy --resolve-image changed --prune -c osi4iot_stack.yml osi4iot`, options)
						.then((exitCode) => {
							if (exitCode === 0) {
								let index = 0;
								let timeCounter = 0;
								setInterval(function () {
									process.stdout.write(`\rWaiting until node-red instances services be ready ${dots[index]}`);
									index = index < (dots.length - 1) ? index + 1 : 0;
									if (timeCounter >= 30) {
										let text = execSync(`docker ${dockerHost} service ls`).toString();
										const services = text.split('\n').filter(line => !line.includes("osi4iot_system_prune")).join('\n');
										let continuar = services.includes(" 0/1 ") ||
											services.includes(" 0/2 ") ||
											services.includes(" 1/2 ") ||
											services.includes(" 0/3 ") ||
											services.includes(" 1/3 ") ||
											services.includes(" 2/3 ");
										if (!continuar) {
											console.log("\nRemoving unused containers, volumes and images.");
											pruneSystemAndVolumes(osi4iotState.platformInfo.NODES_DATA);
											console.log(clc.greenBright("\nOSI4IOT platform is ready to be used !!!\n"))
											process.stdout.write('\u001B[?25h');
											clearInterval(this);
											if(!runInBackground) chooseOption();
										}
									} else timeCounter++;
								}, 1000);
							}
						})
				} else {
					if(!runInBackground) chooseOption();
				}
			})
			.catch((error) => {
				const errorMessage = `Docker stack could not be deployed. Error: ${error}`;
				throw new Error(errorMessage);
			})
	} else {
		if(!runInBackground) clearScreen();
	}
}
