import { execSync } from 'child_process';
import clc from "cli-color";
import fs from 'fs';
import addNFSFolders from '../generic_tools/addNFSFolders.js';
import addEFSFolders from '../generic_tools/addEFSFolders.js';
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

const installAcme_sh = (nodeData, awsData) => {
	const nodeHostName = nodeData.nodeHostName;
	console.log(clc.green(`\nInstalling acme.js in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/acme_installation.sh')) {
		execSync("curl -o ./installation_scripts/acme_installation.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/acme_installation.sh", { stdio: 'ignore' });
	}

	try {
		const pwd = execSync("pwd").toString().split('\n').join('');
		execSync(`bash ./installation_scripts/acme_installation.sh "${awsData.email}"`, { stdio: 'inherit' });
		execSync('crontab -l > crontab_new');
		const commandLine = `0 23 * * * cd ${pwd} && eval \`ssh-agent -s\` && ssh-add ./.osi4iot_keys/osi4iot_key  && osi4iot run`;
		fs.appendFileSync(`${pwd}/crontab_new`, commandLine);
		execSync('crontab crontab_new && rm crontab_new');
		return "OK";
	} catch (err) {
		return `Error installing acme.sh in node: ${nodeHostName}\n`;
	}
}

const installEFS = (nodeData, efsDNS) => {
	const nodeHostName = nodeData.nodeHostName;
	console.log(clc.green(`\nInstalling efs client in node ${nodeHostName}...`));
	if (!fs.existsSync('./installation_scripts')) {
		fs.mkdirSync('./installation_scripts');
	}
	if (!fs.existsSync('./installation_scripts/efs_client_install.sh')) {
		execSync("curl -o ./installation_scripts/efs_client_install.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/installation_scripts/efs_client_install.sh", { stdio: 'ignore' });
	}
	try {
		execSync(`sudo bash ./installation_scripts/efs_client_install.sh ${efsDNS}`, { stdio: 'inherit' })
		return "OK";
	} catch (err) {
		console.log(clc.redBright(`Error installing efs client in node: ${nodeHostName}\n`))
		return "Failed";
	}
}

export default async function (nodesData, organizations, deploymentLocation = null, awsData = null) {
	const numNodes = nodesData.length;
	let isUFWInstalationNeeded = false;
	let isAcmeInstalled = false;
	// if (deploymentLocation !== "Local deployment") {
	if (deploymentLocation === "On-premise cluster deployment") {
		isUFWInstalationNeeded = true;
	}
	const ips_array = nodesData.filter(node => node.nodeRole !== "NFS server").map(node => node.nodeIP).join(",");
	let outputResults = "OK";
	for (let inode = 0; inode < numNodes; inode++) {
		const nodeRole = nodesData[inode].nodeRole;
		const nodeIP = nodesData[inode].nodeIP;
		if (isUFWInstalationNeeded) {
			const ouputUFW = installUFW(nodesData[inode]);
			if (ouputUFW !== "OK") outputResults = "Failed";
		}

		if (!isAcmeInstalled &&
			isLocahostNode(nodeIP) &&
			awsData && awsData.domainCertsType === "Let's encrypt certs and AWS Route 53"
		) {
			const ouputAcme_sh = installAcme_sh(nodesData[inode], awsData);
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

		if (isLocahostNode(nodeIP) && deploymentLocation === "AWS cluster deployment" && awsData) {
			const outputEFS = installEFS(nodesData[inode], awsData.efsDNS);
			if (outputEFS !== "OK") outputResults = "Failed";
			for (const org of organizations) {
				const org_acronym = org.org_acronym;
				const md_hashes_array = org.master_devices.map(md => md.md_hash).join(",");
				addEFSFolders(nodesData[inode], org_acronym, md_hashes_array);
			}
		}
	}

	if (outputResults === "Failed") {
		throw new Error("Error in nodes configuration");
	}
}

