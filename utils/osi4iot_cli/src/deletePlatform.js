import clc from "cli-color";
import fs from 'fs';
import { execSync } from 'child_process';
import execShellCommand from './execShellCommand.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import removeAllDockerVolumes from './pruneSystemAndVolumes.js'
import inquirer from './inquirer.js';
import { chooseOption } from './chooseOption.js';

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

export default function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		inquirer
			.prompt([{
				name: 'confirm_clean_stack',
				type: 'confirm',
				message: 'With this command the platform will stop and all related images and volumes are going be deleted. Are you sure to continue?',
			}
			])
			.then(async (answers) => {
				if (answers.confirm_clean_stack) {
					const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
					const osi4iotState = JSON.parse(osi4iotStateText);
					const nodesData = osi4iotState.platformInfo.NODES_DATA;
					const dockerHost = findManagerDockerHost(nodesData);
					const response = execSync(`docker ${dockerHost} service ls`);
					const numServices = response.toString().split('\n').length - 2;
					if (numServices !== 0) {
						execShellCommand(`docker ${dockerHost} stack rm osi4iot`)
							.then(() => {
								return new Promise(function (resolve, reject) {
									let index = 0
									setInterval(function () {
										process.stdout.write(`\rWaiting until all services be removed ${dots[index]}`);
										index = index < (dots.length - 1) ? index + 1 : 0;
										let text;
										try {
											text = execSync(`docker ${dockerHost} service ls`);
										} catch (err) {
											reject("Error listing docker services.")
										}
										let continuar = text.indexOf(" 1/1 ") !== -1 ||
											text.indexOf(" 1/3 ") !== -1 ||
											text.indexOf(" 2/3 ") !== -1 ||
											text.indexOf(" 3/3 ") !== -1;
										if (!continuar) {
											clearInterval(this);
											console.log(clc.green("\nRemoving all docker volumes..."));
											removeAllDockerVolumes(osi4iotState);
					
											console.log(clc.green("\nRemoving all docker images..."));
											removeAllPlatformImages(osi4iotState);

											removeDirectories();
											resolve("Finish");
										}
									}, 1000);
								})
							})
							.catch((error) => {
								const errorMessage = `Error removing docker stack. Error: ${error}`;
								throw new Error(errorMessage);
							})
					} else {
						console.log(clc.green("\nRemoving all docker volumes..."));
						removeAllDockerVolumes(osi4iotState);

						console.log(clc.green("\nRemoving all docker images..."));
						removeAllPlatformImages(osi4iotState);

						removeDirectories();
					}
				} else {
					chooseOption();
				}
			})
			.catch((error) => {
				if (error.isTtyError) {
					console.log("Prompt couldn't be rendered in the current environment")
				} else {
					console.log("Error in osi4iot cli: ", error)
				}
			});
	}
}

const removeAllPlatformImages = (osi4iotState) => {
	const nodesData = osi4iotState.platformInfo.NODES_DATA.filter(node => node.nodeRole !== "NFS server");
	for (const nodeData of nodesData) {
		const userName = nodeData.nodeUserName;
		const nodeIP = nodeData.nodeIP;
		const dockerHost = nodeIP === "localhost" ? "" : `-H ssh://${userName}@${nodeIP}`;
		execSync(`docker ${dockerHost} system prune --force`);
	}
}

const removeDirectories = () => {
	console.log(clc.green("\nRemoving certs directory..."));
	const certs_dir = "./certs"
	if (fs.existsSync(certs_dir)) {
		fs.rmSync(certs_dir, { recursive: true, force: true });
	}

	console.log(clc.green("Removing config directory..."));
	const config_dir = "./config"
	if (fs.existsSync(config_dir)) {
		fs.rmSync(config_dir, { recursive: true, force: true });
	}

	console.log(clc.green("Removing secrets directory..."));
	const secrets_dir = "./secrets"
	if (fs.existsSync(secrets_dir)) {
		fs.rmSync(secrets_dir, { recursive: true, force: true });
	}

	console.log(clc.green("Removing stack file ..."));
	const stack_file = "./osi4iot_stack.yml"
	if (fs.existsSync(stack_file)) {
		fs.rmSync(stack_file, { recursive: true, force: true });
	}

	console.log(clc.green("Removing state file ..."));
	const state_file = "./osi4iot_state.json"
	if (fs.existsSync(state_file)) {
		fs.rmSync(state_file, { recursive: true, force: true });
	}
}