import os from 'os';
import clc from "cli-color";
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import sshCopyId from '../generic_tools/sshCopyId.js';
import isLocahostNode from "./isLocalhostNode.js";

export default async function (numberOfNodesToAdd, prevNodesData, defaultUserName, deploymentLocation) {
	const numSwarmNodes = prevNodesData.length + numberOfNodesToAdd;
	let newNodesData = [];
	const nodesData = [...prevNodesData];
	console.log("nodesData=", nodesData)
	const iniIndex = nodesData.length + 1;
	const endIndex = nodesData.length + numberOfNodesToAdd;
	for (let inode = iniIndex; inode <= endIndex; inode++) {
		await swarmNodeQuestions(nodesData, defaultUserName, numSwarmNodes, deploymentLocation, inode).then(answers => {
			newNodesData.push(answers);
			nodesData.push(answers);
			if (answers.nodeHostName !== defaultUserName) defaultUserName = answers.nodeUserName;
		});
	}
	return newNodesData;
}

const swarmNodeQuestions = async (nodesData, defaultUserName, numSwarmNodes, deploymentLocation, inode) => {
	const nodeHostNames = nodesData.map(node => node.nodeHostName);
	const nodeIPs = nodesData.map(node => node.nodeIP);
	console.log(clc.whiteBright(`\nNode ${inode} data:`));
	let choosenNodeIP;
	return inquirer
		.prompt([
			{
				name: "nodeHostName",
				message: "Node hostname:",
				validate: function (nodeName) {
					if (!nodeHostNames.includes(nodeName)) {
						if (nodeName.length >= 5) {
							return true;
						} else {
							return "Please type at least 5 characters";
						}
					} else {
						return `Already exists a node with hostname: ${nodeName}`;
					}
				}
			},
			{
				name: "nodeIP",
				message: "Node IP address:",
				validate: function (nodeIP) {
					if (!nodeIPs.includes(nodeIP)) {
						const validIP = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(nodeIP)
						if (validIP || isLocahostNode(nodeIP)) {
							choosenNodeIP = nodeIP;
							return true;
						} else {
							return "Please type a valid IP address";
						}
					} else {
						return `Already exists a node with IP: ${nodeIP}`;
					}
				}
			},
			{
				name: "nodeUserName",
				message: "Node user name:",
				default: defaultUserName,
				validate: function (nodeUserName) {
					if (nodeUserName.length >= 5) {
						return true;
					} else {
						return "Please type at least 5 characters";
					}
				}
			},
			{
				name: "nodeRole",
				message: "Node role in the platform:",
				type: 'list',
				default: "Manager",
				choices: ["Manager", "Platform worker", "Generic org worker", "Exclusive org worker", "NFS server"],
				when: () => numSwarmNodes > 1,
				validate: function (nodeRole) {
					if (isLocahostNode(choosenNodeIP) && nodeRole !== "Manager") {
						return "A localhost node must have manager role";
					} else {
						return true;
					}
				}
			},
		])
		.then(async (newNode) => {
			const userName = newNode.nodeUserName;
			const nodeIP = newNode.nodeIP;
			if (numSwarmNodes === 1) {
				newNode.nodeRole = "Manager";
			}

			let status = "OK";
			if (!isLocahostNode(nodeIP)) {
				if (inode === 1 && deploymentLocation === "AWS cluster deployment") {
					console.log(clc.redBright("Error: The first node in AWS cluster deployment must be the localhost."));
					status = "Failed"
				} else {
					if (deploymentLocation !== "AWS cluster deployment") {
						status = await sshCopyId(userName, nodeIP);
					}
					if (status === "Failed") {
						console.log(clc.redBright("Error: Connection with the indicated node cannot be established"));
					} else {
						const nodeArch = execSync(`ssh ${userName}@${nodeIP} 'uname -m'`).toString().trim();
						if (!(nodeArch === "x86_64" || nodeArch === "aarch64")) {
							console.log(clc.redBright("Error: Only are supported amd64 and arm64 architectures"));
							status = "Failed";
						}
						newNode.nodeArch = nodeArch
						if (newNode.nodeRole !== "NFS server") {
							try {
								const checkDockerInstallation = execSync(`ssh ${userName}@${nodeIP} 'which docker && docker --version'`).toString();
								if (checkDockerInstallation) {
									console.log(clc.greenBright("Docker is installed"))
								}
							} catch (err) {
								console.log(clc.redBright("Error: Docker is not installed in this node"))
								status = "Failed";
							}
						}
					}
				}
			} else {
				if (inode === 1 && deploymentLocation === "AWS cluster deployment" && newNode.nodeRole !== "Manager") {
					console.log(clc.redBright("Error: The first node in AWS cluster deployment must be the localhost and must have Manager role"));
					status = "Failed";
				} else {
					const localNodeArch = os.arch();
					if (localNodeArch === "x64") {
						newNode.nodeArch = "x86_64";
					} else if (localNodeArch === "arm64") {
						newNode.nodeArch = "aarch64";
					} else {
						console.log(clc.redBright("Error: Only amd64 and arm64 architectures are supported"));
						status = "Failed";
					}

					if (newNode.nodeRole !== "NFS server") {
						try {
							const checkDockerInstallation = execSync("which docker && docker --version").toString();
							if (checkDockerInstallation) {
								console.log(clc.greenBright("Docker is installed"))
							}
						} catch (err) {
							console.log(clc.redBright("Error: Docker is not installed in this node"))
							status = "Failed";
						}
					}
				}
			}


			console.log("");
			if (status === "OK") {
				return newNode;
			} else {
				await swarmNodeQuestions(nodesData, defaultUserName, numSwarmNodes, deploymentLocation, inode);
			}

		});
}