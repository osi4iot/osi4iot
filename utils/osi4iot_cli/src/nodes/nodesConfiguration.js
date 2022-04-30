import { execSync } from 'child_process';
import clc from "cli-color";
import fs from 'fs';
import execShellCommand from '../generic_tools/execShellCommand.js';
import addNFSFolders from '../generic_tools/addNFSFolders.js';

const installDocker = async (nodeData, isLocalDeploy) => {
	const nodeHostName = nodeData.nodeHostName;
	const userName = nodeData.nodeUserName;
	const nodeIP = nodeData.nodeIP;
	console.log(clc.green(`\nInstalling docker in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/docker_install.sh')) {
		execSync("curl -o ./installation_scripts/docker_install.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/docker_install.sh", { stdio: 'ignore' });
	}
	if (isLocalDeploy) {
		try {
			execSync("bash ./installation_scripts/docker_install.sh");
			return "OK";
		} catch (err) {
			return `Error installing docker in node: ${nodeHostName}\n`;
		}
	} else {
		try {
			if (nodeIP === "localhost") {
				await execShellCommand(`ssh ${userName}@${nodeIP} sudo bash ./installation_scriptsdocker_install.sh`)
			} else {
				execSync(`scp ./installation_scripts/docker_install.sh ${userName}@${nodeIP}:/home/${userName}`);
				await execShellCommand(`ssh ${userName}@${nodeIP} sudo bash docker_install.sh`)
				execSync(`ssh ${userName}@${nodeIP} rm /home/${userName}/docker_install.sh`);
			}
			return "OK";
		} catch (err) {
			return `Error installing docker in node: ${nodeHostName}\n`;
		}
	}
}

const installUFW = async (nodeData) => {
	const nodeHostName = nodeData.nodeHostName;
	const userName = nodeData.nodeUserName;
	const nodeIP = nodeData.nodeIP;
	const nodeRole = nodeData.nodeRole;
	console.log(clc.green(`\nInstalling ufw in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/ufw_install.sh')) {
		execSync("curl -o ./installation_scripts/ufw_install.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/ufw_install.sh", { stdio: 'ignore' });
	}

	try {
		if (nodeIP === "localhost") {
			// await execShellCommand(`sudo bash ./installation_scripts/ufw_install.sh "${nodeRole}"`)
			execSync(`sudo bash ./installation_scripts/ufw_install.sh "${nodeRole}"`)
		} else {
			execSync(`scp ./installation_scripts/ufw_install.sh ${userName}@${nodeIP}:/home/${userName}`);
			await execShellCommand(`ssh ${userName}@${nodeIP} sudo bash ufw_install.sh "${nodeRole}"`)
			execSync(`ssh ${userName}@${nodeIP} rm /home/${userName}/ufw_install.sh`);
		}
		return "OK";
	} catch (err) {
		return `Error installing ufw in node: ${nodeHostName}\n`;
	}
}

const installNFS = async (nodeData, ips_array) => {
	const nodeHostName = nodeData.nodeHostName;
	const userName = nodeData.nodeUserName;
	const nodeIP = nodeData.nodeIP;
	console.log(clc.green(`\nInstalling nfs sever in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/ufw_install.sh')) {
		execSync("curl -o ./installation_scripts/ufw_install.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/nfs_server_install.sh", { stdio: 'ignore' });
	}
	try {
		execSync(`scp ./installation_scripts/nfs_server_install.sh ${userName}@${nodeIP}:/home/${userName}`);
		await execShellCommand(`ssh ${userName}@${nodeIP} sudo bash nfs_server_install.sh" "${ips_array}"`)
		execSync(`ssh ${userName}@${nodeIP} rm /home/${userName}/nfs_server_install.sh`);
		return "OK";
	} catch (err) {
		console.log(clc.bgRedBright(`Error installing nfs in node: ${nodeHostName}\n`))
		return "Failed";
	}
}

export default async function (nodesData, organizations) {
	const numNodes = nodesData.length;
	let isLocalDeploy = false;
	if (numNodes === 1 && nodesData[0].nodeIP === "localhost") {
		isLocalDeploy = true;
	}
	const ips_array = nodesData.map(node => node.nodeIP).join(",");;
	let outputResults = "OK";
	for (let inode = 0; inode < numNodes; inode++) {
		const nodeRole = nodesData[inode].nodeRole;
		if (!isLocalDeploy) {
			const ouputUFW = await installUFW(nodesData[inode]);
			if (ouputUFW !== "OK") outputResults = "Failed";
		}
		if (nodeRole === "NFS server") {
			const outputNFS = await installNFS(nodesData[inode], ips_array);
			if (outputNFS !== "OK") outputResults = "Failed";
			for (const org of organizations) {
				const org_acronym = org.org_acronym;
				const md_hashes_array = org.master_devices.map(md => md.md_hash).join(",");
				await addNFSFolders(nodesData[inode], org_acronym, md_hashes_array);
			}

		} else {
			const ouputDocker = await installDocker(nodesData[inode], isLocalDeploy);
			if (ouputDocker !== "OK") outputResults = "Failed";
		}
	}

	if (outputResults === "Failed") {
		throw new Error("Error in nodes configuration");
	}
}

