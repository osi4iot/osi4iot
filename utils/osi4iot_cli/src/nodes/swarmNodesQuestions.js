import os from 'os';
import clc from "cli-color";
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import sshCopyId from '../generic_tools/sshCopyId.js';

export default async function (numberOfNodesToAdd, prevNodesData, defaultUserName) {
	const numSwarmNodes = prevNodesData.length + numberOfNodesToAdd;
	const newNodesData = [];
	const nodesData = [...prevNodesData];

	for (let inode = 1; inode <= numberOfNodesToAdd; inode++) {
		await swarmNodeQuestions(nodesData, defaultUserName, numSwarmNodes, inode).then(answers => {
			newNodesData.push(answers);
			nodesData.push(answers);
		});
	}

	return newNodesData;
}

const swarmNodeQuestions = async (nodesData, defaultUserName, numSwarmNodes, inode) => {
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
						if (validIP || nodeIP === "localhost") {
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
					if (choosenNodeIP === "localhost" && nodeRole !== "Manager") {
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
			if (nodeIP !== "localhost") {
				await sshCopyId(userName, nodeIP);
				const nodeArch = execSync(`ssh ${userName}@${nodeIP} uname -m`).toString().trim();
				if (!(nodeArch === "x86_64" || nodeArch === "aarch64")) {
					console.log(clc.redBright("Error: Only are supported amd64 and arm64 architectures"));
					status = "Failed";
				}
				newNode.nodeArch = nodeArch
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
			}

			console.log("");
			if (status === "OK") {
				return newNode;
			} else {
				await swarmNodeQuestions(nodesData, defaultUserName, numSwarmNodes, inode);
			}

		});
}