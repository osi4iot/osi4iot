import clc from "cli-color";
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import execShellCommand from '../generic_tools/execShellCommand.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import cleanSystemAndVolumes from './cleanSystemAndVolumes.js'
import inquirer from '../generic_tools/inquirer.js';
import { chooseOption } from './chooseOption.js';
import clearScreen from "./clearScreen.js";
import isLocahostNode from "../nodes/isLocalhostNode.js";

// function sleep(ms) {
// 	return new Promise(resolve => setTimeout(resolve, ms));
// }

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
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const nodesData = osi4iotState.platformInfo.NODES_DATA;
		const deploymentLocation = osi4iotStateInitial.platformInfo.DEPLOYMENT_LOCATION;
		if (nodesData && nodesData.length) {
			inquirer
				.prompt([{
					name: 'confirm_clean_stack',
					type: 'confirm',
					message: 'With this command the platform will stop and all related images and volumes are going be deleted. Are you sure to continue?',
				}
				])
				.then(async (answers) => {
					if (answers.confirm_clean_stack) {
						const dockerHost = findManagerDockerHost(nodesData);
						const response = execSync(`docker ${dockerHost} service ls`);
						const numServices = response.toString().split('\n').length - 2;
						if (numServices !== 0) {
							execShellCommand(`docker ${dockerHost} stack rm osi4iot`)
								.then(() => {
									return new Promise(function (resolve, reject) {
										let index = 0
										setInterval(function () {
											process.stdout.write(`\rWaiting until all containers be stopped ${dots[index]}`);
											index = index < (dots.length - 1) ? index + 1 : 0;
											let osi4iotContainerList;
											try {
												const containerList = execSync(`docker ${dockerHost} ps`).toString().split("\n");
												osi4iotContainerList = containerList.filter(container => container.includes("osi4iot"))
											} catch (err) {
												reject("Error listing docker containers.")
											}

											if (osi4iotContainerList.length === 0) {
												clearInterval(this);
												resolve("Finish");
											}
										}, 1000);
									})
								})
								.then(() => {
									console.log(clc.green("\nRemoving all docker images and volumes..."));
									cleanSystemAndVolumes(osi4iotState.platformInfo.NODES_DATA);

									console.log(clc.green("Removing nodes of swarm cluster..."));
									removeNodesOfSwarmCluster(osi4iotState.platformInfo.NODES_DATA);

									const NFS_ServerNode = nodesData.filter(node => node.nodeRole === "NFS server")[0];
									if (NFS_ServerNode !== undefined) {
										console.log(clc.green("Removing NFS server..."));
										removeNFS_Server(NFS_ServerNode);
									}

									console.log(clc.green("\nRemoving platform directories and files..."));
									removeDirectories(deploymentLocation);

									if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
										removeAcmeSh(osi4iotState);
									}
								})
								.catch((error) => {
									const errorMessage = `Error removing docker stack. Error: ${error}`;
									throw new Error(errorMessage);
								})
						} else {
							console.log(clc.green("\nRemoving all docker images and volumes..."));
							cleanSystemAndVolumes(osi4iotState.platformInfo.NODES_DATA);

							console.log(clc.green("Removing nodes of swarm cluster..."));
							removeNodesOfSwarmCluster(osi4iotState.platformInfo.NODES_DATA);

							const NFS_ServerNode = nodesData.filter(node => node.nodeRole === "NFS server")[0];
							if (NFS_ServerNode !== undefined) {
								console.log(clc.green("Removing NFS server..."));
								removeNFS_Server(NFS_ServerNode);
							}

							console.log(clc.green("\nRemoving platform directories and files..."));
							removeDirectories(deploymentLocation);

							if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "Let's encrypt certs and AWS Route 53") {
								console.log(clc.green("Removing acme.sh..."));
								removeAcmeSh(osi4iotState);
							}
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
		} else {
			clearScreen();
		}
	}
}


const removeDirectories = (deploymentLocation) => {
	console.log(clc.green("Removing certs directory..."));
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

	console.log(clc.green("Removing installation_scripts directory..."));
	const installation_scripts_dir = "./installation_scripts"
	if (fs.existsSync(installation_scripts_dir)) {
		fs.rmSync(installation_scripts_dir, { recursive: true, force: true });
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

	console.log(clc.green("Removing ssh keys..."));
	const ssh_keys_dir = "./.osi4iot_keys";
	if (fs.existsSync(ssh_keys_dir)) {
		execSync("ssh-add -D");
		fs.rmSync(ssh_keys_dir, { recursive: true, force: true });
	}

	if (deploymentLocation === "AWS cluster deployment") {
		console.log(clc.green("Removing efs folders..."));
		const efs_dir = "/home/ubuntu/efs_osi4iot";
		if (fs.existsSync(efs_dir)) {
			fs.rmSync(efs_dir, { recursive: true, force: true });
			execSync("sudo sed -i '/efs_osi4iot nfs4 nfsvers=4.1/d' /etc/fstab && sudo mount -a");
		}
	}
}

const removeNodesOfSwarmCluster = (nodesData) => {
	const nodesInSwarm = nodesData.filter(node => node.nodeRole !== "NFS server");
	for (const nodeData of nodesInSwarm) {
		const userName = nodeData.nodeUserName;
		const nodeIP = nodeData.nodeIP;
		if (isLocahostNode(nodeIP)) {
			try {
				execSync("docker swarm leave --force", { stdio: 'ignore' });
			} catch (err) {
				//do nothing
			}
		} else {
			try {
				execSync(`ssh ${userName}@${nodeIP} 'docker swarm leave --force'`, { stdio: 'ignore' });
			} catch (err) {
				//do nothing
			}
		}
	}
}

const removeNFS_Server = (nodeData) => {
	const userName = nodeData.nodeUserName;
	const nodeIP = nodeData.nodeIP;
	try {
		execSync(`ssh ${userName}@${nodeIP} 'sudo service nfs-kernel-server stop'`, { stdio: 'ignore' });
		execSync(`ssh ${userName}@${nodeIP} 'sudo rm -rf /var/nfs_osi4iot'`, { stdio: 'ignore' });
		execSync(`ssh ${userName}@${nodeIP} "sudo sed -i '/nfs_osi4iot/d' /etc/exports"`, { stdio: 'ignore' });
	} catch (err) {
		console.log(clc.redBright("\nError removing NFS server."));
	}
}

const removeAcmeSh = (osi4iotState) => {
	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	const homedir = os.homedir();
	const acmeDomainDir = `${homedir}/.acme.sh/${domainName}`;
	if (fs.existsSync(acmeDomainDir)) {
		fs.rmSync(acmeDomainDir, { recursive: true, force: true });
	}
	try {
		const pwd = execSync("pwd").toString().split('\n').join('');
		execSync(`crontab -l > crontab_new && sed -i '\\:0 23 \\* \\* \\* cd ${pwd} && osi4iot run:d' crontab_new`);
		execSync("crontab crontab_new && rm crontab_new");
	} catch (err) {
		console.log(clc.redBright("\nError removing acme.sh"));
	}
}