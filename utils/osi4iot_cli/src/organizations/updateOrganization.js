import needle from 'needle';
import fs from 'fs';
import clc from "cli-color";
import Table from 'cli-table3';
import { nanoid } from 'nanoid';
import inquirer from '../generic_tools/inquirer.js';
import login from '../menu/login.js';
import { chooseOption } from '../menu/chooseOption.js';
import certsGenerator from '../config_tools/certsGenerator.js';;
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import generateNodeLabels from '../nodes/generateNodeLabels.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import addNFSFolders from '../generic_tools/addNFSFolders.js';
import removeNFSFolders from '../generic_tools/removeNFSFolders.js';
import runStack from '../menu/runStack.js';


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
			const urlGetOrgs = `${domainName}/admin_api/organizations/user_managed`;
			const orgs = await needle('get', urlGetOrgs, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get org error: %s", err.message));

			const urlGetMasterDevices = `${domainName}/admin_api/master_devices`;
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
						message: "Select the id of the org you want to update:",
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
					const orgToUpdate = orgs.filter(org => org.id === orgId)[0];
					const masterDevicesInOrg = masterDevices.filter(md => md.orgId === orgId);
					updateOrgQuestions(accessToken, osi4iotState, orgToUpdate, masterDevicesInOrg);
				});
		} else {
			console.log("\n");
			chooseOption();
		}
	}
}

const updateOrgQuestions = (accessToken, osi4iotState, orgToUpdate, masterDevicesInOrg) => {
	const orgAcronym = orgToUpdate.acronym;
	const nodesData = osi4iotState.platformInfo.NODES_DATA.filter(node => node.nodeRole !== "NFS server");
	const currentOrgs = osi4iotState.certs.mqtt_certs.organizations;
	const currentOrgServicesDeploymentPlace = "Generic org worker";
	let workerNodesRows = [];
	const defaultWorkerNodesRows = [];
	const orgWorkerSelection = [
		{
			name: "Select",
			value: "selected"
		}
	];

	if (nodesData.length > 1) {
		const exclusiveOrgWorkerNodes = nodesData.filter(node => node.nodeRole === "Exclusive org worker");
		if (exclusiveOrgWorkerNodes.length !== 0) {
			const alreadyUsedNodes = [];
			const freeNodes = [];
			for (const org of currentOrgs) {
				if (org.exclusiveWorkerNodes.length !== 0) {
					if (org.org_acronym === orgAcronym) {
						freeNodes.push(...org.exclusiveWorkerNodes);
						defaultWorkerNodesRows.push(...org.exclusiveWorkerNodes.map(() => "selected"));
						currentOrgServicesDeploymentPlace = "Exclusive org worker";
					} else alreadyUsedNodes.push(...org.exclusiveWorkerNodes);
				}
			}

			const orgWorkerNodesAvailable = exclusiveOrgWorkerNodes.filter(nodeData => alreadyUsedNodes.indexOf(nodeData.nodeHostName) === -1);
			freeNodes.push(...orgWorkerNodesAvailable);
			defaultWorkerNodesRows.push(...orgWorkerNodesAvailable.map(() => undefined));
			if (freeNodes.length !== 0) {
				workerNodesRows = freeNodes.map((nodeData, index) => {
					const row = { name: nodeData.nodeHostName, value: index + 1 }
					return row;
				});
			}
		}
	}

	inquirer
		.prompt([
			{
				name: 'ORGANIZATION_NAME',
				message: 'Organization name:',
				default: orgToUpdate.name,
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least 4 characters";
					}
				}
			},
			{
				name: 'ORGANIZATION_ACRONYM',
				message: 'Organization acronym:',
				default: orgToUpdate.acronym,
				validate: function (orgAcronym) {
					if (orgAcronym === orgToUpdate.acronym) {
						return true;
					} else {
						return "Org acronym can not be modified.";
					}
				}
			},
			{
				name: 'ORGANIZATION_ADDRESS',
				message: 'Organization address:',
				default: orgToUpdate.address,
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid address";
					}
				}
			},
			{
				name: 'ORGANIZATION_CITY',
				message: 'Organization city:',
				default: orgToUpdate.city,
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid city";
					}
				}
			},
			{
				name: 'ORGANIZATION_ZIP_CODE',
				message: 'Organization zip code:',
				default: orgToUpdate.zipCode,
				validate: function (text) {
					if (text.length >= 5) {
						return true;
					} else {
						return "Please type at least a valid zip code";
					}
				}
			},
			{
				name: 'ORGANIZATION_STATE',
				message: 'Organization state/province:',
				default: orgToUpdate.state,
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid state/province";
					}
				}
			},
			{
				name: 'ORGANIZATION_COUNTRY',
				message: 'Organization country:',
				default: orgToUpdate.country,
				validate: function (text) {
					if (text.length >= 4) {
						return true;
					} else {
						return "Please type at least a valid country";
					}
				}
			},
			{
				name: 'BUILDING_ID',
				message: 'Building id:',
				default: orgToUpdate.buildingId,
				validate: function (buildingId) {
					let valid = false;
					if (buildingId !== "" && Number.isInteger(Number(buildingId)) && Number(buildingId) >= 1) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to one";
					}
				}
			},
			{
				name: 'KEEP_ORG_HASH',
				message: `The current organization hash is org_hash='${orgToUpdate.orgHash}'. Do you want to keep it?`,
				type: 'confirm',
			},
			{
				name: 'ORG_SERVICES_DEPLOYMENT_PLACE',
				message: 'Choose the type of org worker nodes where org services will be deployed',
				type: "list",
				choices: ["Generic org worker", "Exclusive org worker"],
				default: currentOrgServicesDeploymentPlace,
				when: () => nodesData.length > 1 && workerNodesRows.length !== 0
			},
			{
				name: 'ORGANIZATION_EXCLUSIVE_WORKER_NODES',
				type: "table",
				message: "Choose the worker nodes for the organization",
				pageSize: workerNodesRows.length,
				columns: orgWorkerSelection,
				rows: workerNodesRows,
				defaultValues: defaultWorkerNodesRows,
				when: (answers) => workerNodesRows.length !== 0 && answers.ORG_SERVICES_DEPLOYMENT_PLACE === "Exclusive org worker"
			},
			{
				name: 'NUMBER_OF_MASTER_DEVICES_IN_ORG',
				message: 'Number of master devices in org:',
				default: masterDevicesInOrg.length,
				validate: function (numOfMD) {
					let valid = false;
					if (numOfMD !== "" && Number.isInteger(Number(numOfMD)) && Number(numOfMD) >= 1) valid = true;
					if (valid) {
						return true;
					} else {
						return "Please type an integer number greater or equal to one";
					}
				}
			}
		])
		.then(async (answers) => {
			answers.NUMBER_OF_MASTER_DEVICES_IN_ORG = parseInt(answers.NUMBER_OF_MASTER_DEVICES_IN_ORG, 10);
			const orgExclusiveWorkerNodes = [];
			if (workerNodesRows.length !== 0) {
				for (let inode = 0; inode < workerNodesRows.length; inode++) {
					if (answers.ORGANIZATION_EXCLUSIVE_WORKER_NODES[inode] === "selected") {
						orgExclusiveWorkerNodes.push(workerNodesRows[inode].name)
					}
				}
			}
			answers.orgExclusiveWorkerNodes = orgExclusiveWorkerNodes;
			if (answers.NUMBER_OF_MASTER_DEVICES_IN_ORG < masterDevicesInOrg.length) {
				removeMasterDevicesQuestions(accessToken, osi4iotState, orgToUpdate, masterDevicesInOrg, answers);
			} else {
				await requestUpdateOrg(accessToken, osi4iotState, orgToUpdate, answers);
			}
		})
		.catch((error) => {
			if (error.isTtyError) {
				console.log("Prompt couldn't be rendered in the current environment");
			} else {
				console.log("Error in osi4iot cli: ", error)
			}
		})
}

const removeMasterDevicesQuestions = (accessToken, osi4iotState, orgToUpdate, masterDevicesInOrg, orgData) => {
	const numMasterDevicesToRemove = masterDevicesInOrg.length - orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG;
	const table = new Table({
		head: [
			clc.cyanBright('Id'),
			clc.cyanBright('Master Device Hash'),
			clc.cyanBright('Org Id'),
			clc.cyanBright('Group Id'),
			clc.cyanBright('Device Id'),
		],
		colWidths: [8, 15, 8, 8, 8],
		wordWrap: true,
		style: { 'padding-left': 1, 'padding-right': 1 }
	});

	const masterDevicesIdArray = [];
	for (const masterDevice of masterDevicesInOrg) {
		masterDevicesIdArray.push(masterDevice.id);
		const row = [
			masterDevice.id,
			masterDevice.masterDeviceHash,
			masterDevice.orgId,
			masterDevice.groupId === null ? "-" : masterDevice.groupId,
			masterDevice.deviceId === null ? "-" : masterDevice.deviceId
		];
		table.push(row);
	}

	console.log(clc.whiteBright("\nList of master devices in org:"));
	console.log(table.toString());


	let masterDeviceRows = masterDevicesInOrg.map((masterDevice, index) => {
		const row = { name: masterDevice.id, value: index + 1 }
		return row;
	});

	const masterDeviceSelection = [
		{
			name: "Select",
			value: "selected"
		}
	];

	console.log("\n");
	inquirer
		.prompt([
			{
				name: 'MASTER_DEVICES_TO_REMOVE',
				type: "table",
				message: `Choose exactly ${numMasterDevicesToRemove} master device id you want to remove from the above table`,
				pageSize: masterDeviceRows.length,
				columns: masterDeviceSelection,
				rows: masterDeviceRows,
				validate: (selectedArray) => {
					const numSelectedMasterDevices = selectedArray.filter(selection => selection === "selected").length;
					if (numSelectedMasterDevices === numMasterDevicesToRemove) {
						return true;
					} else {
						return `Please select exactly ${numMasterDevicesToRemove} master device id from the above table`;
					}
				}
			}
		])
		.then(async (answers) => {
			const masterDeviceHashesToRemove = [];
			for (let irow = 0; irow < answers.MASTER_DEVICES_TO_REMOVE.length; irow++) {
				if (answers.MASTER_DEVICES_TO_REMOVE[irow] === "selected") {
					masterDeviceHashesToRemove.push(masterDevicesInOrg[irow].masterDeviceHash);
				}
			}
			orgData.masterDeviceHashesToRemove = masterDeviceHashesToRemove;
			await requestUpdateOrg(accessToken, osi4iotState, orgToUpdate, orgData);
		});
}

const requestUpdateOrg = async (accessToken, osi4iotState, orgToUpdate, orgData) => {
	const optionsToken = {
		rejectUnauthorized: false,
		headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" }
	};

	const org_hash = orgData.KEEP_ORG_HASH ? orgToUpdate.orgHash : nanoid(16).replace(/-/g, "x").replace(/_/g, "X");
	const orgIndex = osi4iotState.certs.mqtt_certs.organizations.map(org => org.org_acronym).indexOf(orgToUpdate.acronym.toLowerCase());
	const currentNumMasterDevicesInOrg = osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices.length;
	const masterDevicesHashesToAdd = [];
	const new_master_devices = [];
	if (currentNumMasterDevicesInOrg < orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG) {
		new_master_devices.push(...osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices);
		for (let idev = currentNumMasterDevicesInOrg; idev < orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG; idev++) {
			const md_hash = nanoid(10).replace(/-/g, "x").replace(/_/g, "X");
			masterDevicesHashesToAdd.push(md_hash);
			const master_device = {
				client_crt: "",
				client_key: "",
				expiration_timestamp: 0,
				md_hash,
				is_volume_created: 'false',
				client_crt_name: "",
				client_key_name: ""
			}
			new_master_devices.push(master_device);
		}
	}

	if (currentNumMasterDevicesInOrg > orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG) {
		const old_master_devices = osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices;
		for (let idev = 0; idev < currentNumMasterDevicesInOrg; idev++) {
			if (!orgData.masterDeviceHashesToRemove.includes(old_master_devices[idev].md_hash)) {
				new_master_devices.push(old_master_devices[idev]);
			}
		}
	}

	if (currentNumMasterDevicesInOrg === orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG) {
		new_master_devices.push(...osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices)
	}

	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	const url = `${domainName}/admin_api/organization/id/${orgToUpdate.id}`;
	const updateOrgData = {
		name: orgData.ORGANIZATION_NAME,
		acronym: orgData.ORGANIZATION_ACRONYM,
		address: orgData.ORGANIZATION_ADDRESS,
		city: orgData.ORGANIZATION_CITY,
		zipCode: orgData.ORGANIZATION_ZIP_CODE,
		state: orgData.ORGANIZATION_STATE,
		country: orgData.ORGANIZATION_COUNTRY,
		buildingId: parseInt(orgData.BUILDING_ID, 10),
		orgHash: org_hash,
		masterDeviceHashes: new_master_devices.map(md => md.md_hash),
	};

	const response = await needle('patch', url, updateOrgData, optionsToken)
		.then(res => res.body)
		.catch(err => console.log("Create org error: %s", err.message));

	if (response) {
		if (response.message === "Organization updated successfully") {
			console.log(clc.greenBright("\nOrganization updated successfully\n"));

			osi4iotState.certs.mqtt_certs.organizations[orgIndex].acronym = orgData.ORGANIZATION_ACRONYM.toLowerCase();
			osi4iotState.certs.mqtt_certs.organizations[orgIndex].org_hash = org_hash;
			osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices = [...new_master_devices];
			console.log(clc.green('\nCreating certificates...'));
			await certsGenerator(osi4iotState);
			const osi4iotStateFile = JSON.stringify(osi4iotState);
			fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

			console.log(clc.green('Creating stack file...\n'))
			stackFileGenerator(osi4iotState);

			const nodesData = osi4iotState.platformInfo.NODES_DATA;
			const dockerHost = findManagerDockerHost(nodesData);
			console.log(clc.green('Generating node labels...\n'))
			generateNodeLabels(osi4iotState, dockerHost);

			const nfsNode = nodesData.filter(node => node.nodeRole === "NFS server")[0];
			if (nfsNode !== undefined) {
				const org_acronym = orgData.ORGANIZATION_ACRONYM.toLowerCase();
				if (currentNumMasterDevicesInOrg < orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG) {
					const md_hashes_array = masterDevicesHashesToAdd.join(",");
					addNFSFolders(nfsNode, org_acronym, md_hashes_array);
				}
				if (currentNumMasterDevicesInOrg > orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG) {
					const md_hashes_array = orgData.masterDeviceHashesToRemove.join(",");
					removeNFSFolders(nfsNode, org_acronym, md_hashes_array);
				}
			}
			await runStack(osi4iotState, dockerHost);
		} else {
			console.log(clc.redBright(`\nError: ${response.message}\n`));
			chooseOption();
		}
	}
}