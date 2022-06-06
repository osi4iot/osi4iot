import { execSync } from 'child_process';
import clc from "cli-color";
import fs from 'fs';
import addNFSFolders from '../generic_tools/addNFSFolders.js';
import isLocahostNode from "./isLocalhostNode.js";

const installUFW = (nodeData) => {
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
		if (isLocahostNode(nodeIP)) {
			execSync(`sudo bash ./installation_scripts/ufw_install.sh "${nodeRole}"`, { stdio: 'inherit' })
		} else {
			execSync(`scp ./installation_scripts/ufw_install.sh ${userName}@${nodeIP}:/home/${userName}`);
			execSync(`ssh ${userName}@${nodeIP} 'sudo bash ufw_install.sh "${nodeRole}"'`, { stdio: 'inherit' })
			execSync(`ssh ${userName}@${nodeIP} 'rm /home/${userName}/ufw_install.sh'`);
		}
		return "OK";
	} catch (err) {
		return `Error installing ufw in node: ${nodeHostName}\n`;
	}
}

const installNFS = (nodeData, ips_array) => {
	const nodeHostName = nodeData.nodeHostName;
	const userName = nodeData.nodeUserName;
	const nodeIP = nodeData.nodeIP;
	console.log(clc.green(`\nInstalling nfs sever in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/nfs_server_install.sh')) {
		execSync("curl -o ./installation_scripts/nfs_server_install.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/nfs_server_install.sh", { stdio: 'ignore' });
	}
	try {
		execSync(`scp ./installation_scripts/nfs_server_install.sh ${userName}@${nodeIP}:/home/${userName}`);
		execSync(`ssh ${userName}@${nodeIP} 'sudo bash nfs_server_install.sh "${ips_array}"'`, { stdio: 'inherit' })
		execSync(`ssh ${userName}@${nodeIP} 'rm /home/${userName}/nfs_server_install.sh'`);
		return "OK";
	} catch (err) {
		console.log(clc.redBright(`Error installing nfs in node: ${nodeHostName}\n`))
		return "Failed";
	}
}

const installAcme_sh = (nodeData, awsRoute53Data) => {
	const nodeHostName = nodeData.nodeHostName;
	console.log(clc.green(`\nInstalling acme.js in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/acme_installation.sh')) {
		execSync("curl -o ./installation_scripts/acme_installation.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/acme_installation.sh", { stdio: 'ignore' });
	}

	const env = {
		...process.env,
		AWS_ACCESS_KEY_ID: awsRoute53Data.AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: awsRoute53Data.AWS_SECRET_ACCESS_KEY
	}

	try {
		execSync(`sudo bash ./installation_scripts/acme_installation.sh "${awsRoute53Data.email}"`, { stdio: 'inherit' });
		const pwd = execSync("pwd").toString();
		execSync(`crontab -l > crontab_new && echo "0 23 * * * cd ${pwd} && osi4iot run" >> crontab_new && crontab crontab_new && rm crontab_new`);
		return "OK";
	} catch (err) {
		return `Error installing acme.sh in node: ${nodeHostName}\n`;
	}
}

export default async function (nodesData, organizations, awsRoute53Data = null) {
	const numNodes = nodesData.length;
	let isLocalDeploy = false;
	let isAcmeInstalled = false;
	if (numNodes === 1 && isLocahostNode(nodesData[0].nodeIP)) {
		isLocalDeploy = true;
	}
	const ips_array = nodesData.filter(node => node.nodeRole !== "NFS server").map(node => node.nodeIP).join(",");
	let outputResults = "OK";
	for (let inode = 0; inode < numNodes; inode++) {
		const nodeRole = nodesData[inode].nodeRole;
		const nodeIP = nodesData[inode].nodeIP;
		if (!isLocalDeploy) {
			const ouputUFW = installUFW(nodesData[inode]);
			if (ouputUFW !== "OK") outputResults = "Failed";
		}

		if (!isAcmeInstalled &&
			isLocahostNode(nodeIP) &&
			awsRoute53Data && awsRoute53Data.domainCertsType === "Let's encrypt certs and AWS Route 53"
		) {
			const ouputAcme_sh = installAcme_sh(nodesData[inode], awsRoute53Data);
			if (ouputAcme_sh !== "OK") outputResults = "Failed";
			isAcmeInstalled = true;
		}

		if (nodeRole === "NFS server") {
			const outputNFS = installNFS(nodesData[inode], ips_array);
			if (outputNFS !== "OK") outputResults = "Failed";
			for (const org of organizations) {
				const org_acronym = org.org_acronym;
				const md_hashes_array = org.master_devices.map(md => md.md_hash).join(",");
				addNFSFolders(nodesData[inode], org_acronym, md_hashes_array);
			}
		}
	}

	if (outputResults === "Failed") {
		throw new Error("Error in nodes configuration");
	}
}

