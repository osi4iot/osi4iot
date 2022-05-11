import needle from 'needle';
import fs from 'fs';
import clc from "cli-color";
import Table from 'cli-table3';
import inquirer from '../generic_tools/inquirer.js';
import login from '../menu/login.js';
import { chooseOption } from '../menu/chooseOption.js';
import runStack from '../menu/runStack.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import removeNFSFolders from '../generic_tools/removeNFSFolders.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const accessToken = await login(osi4iotState);
		if (accessToken && accessToken !== "Login error") {
			const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
			const optionsToken = {
				headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" },
				rejectUnauthorized: false
			};
			const urlGetOrgs = `https://${domainName}/admin_api/organizations/user_managed`;
			const orgs = await needle('get', urlGetOrgs, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get org error: %s", err.message));

			const urlGetMasterDevices = `https://${domainName}/admin_api/master_devices`;
			const masterDevices = await needle('get', urlGetMasterDevices, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get master devices error: %s", err.message));

			const table = new Table({
				head: [
					clc.cyanBright('Id'),
					clc.cyanBright('Name'),
					clc.cyanBright('Acronym'),
					clc.cyanBright('Address'),
					clc.cyanBright('City'),
					clc.cyanBright('Zip Code'),
					clc.cyanBright('State'),
					clc.cyanBright('Country'),
					clc.cyanBright('Building Id'),
					clc.cyanBright('Org hash'),
					clc.cyanBright('Num master devices')
				],
				colWidths: [5, 30, 15, 30, 19, 8, 19, 19, 10, 18, 12],
				wordWrap: true,
				style: { 'padding-left': 1, 'padding-right': 1 }
			});


			const orgIdArray = [];
			for (let iorg = 0; iorg < orgs.length; iorg++) {
				orgIdArray.push(orgs[iorg].id);
				const numMasterDevicesInOrg = masterDevices.filter(md => md.orgId === orgs[iorg].id).length;
				const row = [
					orgs[iorg].id,
					orgs[iorg].name,
					orgs[iorg].acronym,
					orgs[iorg].address,
					orgs[iorg].city,
					orgs[iorg].zipCode,
					orgs[iorg].state,
					orgs[iorg].country,
					orgs[iorg].buildingId,
					orgs[iorg].orgHash,
					numMasterDevicesInOrg
				];
				table.push(row);
			}

			console.log(table.toString());

			console.log("\n");
			inquirer
				.prompt([
					{
						name: "orgId",
						message: "Select the id of the org you want to remove:",
						validate: function (orgId) {
							if (orgIdArray.indexOf(parseInt(orgId, 10)) !== -1) {
								return true;
							} else {
								return "Please type an id of the above table";
							}
						}
					}
				])
				.then(async (answers) => {
					const orgId = parseInt(answers.orgId);
					const orgData = orgs.filter(org => org.id === orgId)[0];
					await requestRemoveOrg(accessToken, osi4iotState, orgData);
				});
		} else {
			console.log("\n");
			chooseOption();
		}
	}
}

const requestRemoveOrg = async (accessToken, osi4iotState, orgData) => {

	const optionsToken = {
		rejectUnauthorized: false,
		headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" }
	};

	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	const url = `https://${domainName}/admin_api/organization/id/${orgData.id}`;

	const response = await needle('delete', url, null, optionsToken)
		.then(res => res.body)
		.catch(err => console.log("Remove org error: %s", err.message));

	if (response) {
		if (response.message === "Organization deleted successfully") {
			console.log(clc.greenBright("\Organization deleted successfully\n"));

			const orgAcronym = orgData.acronym.toLowerCase()
			const orgIndex = osi4iotState.certs.mqtt_certs.organizations.map(org => org.org_acronym).indexOf(orgAcronym);
			const orgToRemove = osi4iotState.certs.mqtt_certs.organizations[orgIndex];
			osi4iotState.certs.mqtt_certs.organizations.splice(orgIndex, 1);

			const osi4iotStateFile = JSON.stringify(osi4iotState);
			fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

			console.log(clc.green('Creating stack file...\n'))
			stackFileGenerator(osi4iotState);

			const nodesData = osi4iotState.platformInfo.NODES_DATA;
			const dockerHost = findManagerDockerHost(nodesData);
			removeOrgWorkerNodeLabels(dockerHost, orgToRemove);

			removeMqttCertsFiles(orgToRemove);
			
			const nfsNode = nodesData.filter(node => node.nodeRole === "NFS server")[0];
			if (nfsNode !== undefined) {
				const org_acronym = orgToRemove.org_acronym.toLowerCase();
				const md_hashes_array = orgToRemove.master_devices.map(md => md.md_hash).join(",");
				removeNFSFolders(nfsNode, org_acronym, md_hashes_array);
			}

			await runStack(osi4iotState, dockerHost);
		} else {
			console.log(clc.redBright(`\nError: ${response.message}\n`));
			chooseOption();
		}
	}
}

const removeOrgWorkerNodeLabels = (dockerHost, orgToRemove) => {
	if (orgToRemove.exclusiveWorkerNodes.length !== 0) {
		for (const node in orgToRemove.exclusiveWorkerNodes) {
			execSync(`docker ${dockerHost} node update --label-rm org_hash ${node.nodeName}`);
		}
	}
}

const removeMqttCertsFiles = (orgToRemove) => {
	const num_master_devices = orgToRemove.master_devices.length;
	const org_acronym = orgToRemove.org_acronym;
	for (let idev = 1; idev <= num_master_devices; idev++) {
		const md_hash = orgToRemove.master_devices[idev - 1].md_hash;
		const masterDeviceCertsDir = `./certs/mqtt_certs/org_${org_acronym}_md_${md_hash}`;
		if (fs.existsSync(masterDeviceCertsDir)) {
			fs.rmSync(masterDeviceCertsDir, { recursive: true, force: true });
		}
	}
}