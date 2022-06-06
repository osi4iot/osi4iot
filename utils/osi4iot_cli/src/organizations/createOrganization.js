import fs from 'fs';
import inquirer from 'inquirer';
import { nanoid } from 'nanoid';
import clc from 'cli-color';
import validUrl from 'valid-url';
import needle from 'needle';
import runStack from '../menu/runStack.js';
import login from '../menu/login.js';
import { chooseOption } from '../menu/chooseOption.js';
import certsGenerator from '../config_tools/certsGenerator.js';;
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import generateNodeLabels from '../nodes/generateNodeLabels.js';
import stackFileGenerator from '../config_tools/stackFileGenerator.js';
import addNFSFolders from '../generic_tools/addNFSFolders.js';


export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const accessToken = await login(osi4iotState);
		if (accessToken && accessToken !== "Login error") {
			const nodesData = osi4iotState.platformInfo.NODES_DATA;
			const currentOrgs = osi4iotState.certs.mqtt_certs.organizations;
			let workerNodesRows = [];
			const orgWorkerSelection = [
				{
					name: "Select",
					value: "selected"
				}
			];

			if (nodesData.length !== 0) {
				const exclusiveOrgWorkerNodes = nodesData.filter(node => node.nodeRole === "Exclusive org worker");
				if (exclusiveOrgWorkerNodes.length !== 0) {
					const alreadyUsedNodes = [];
					for (let iorg = 0; iorg < currentOrgs.length; iorg++) {
						if (currentOrgs[iorg].exclusiveWorkerNodes.length !== 0) {
							alreadyUsedNodes.push(...currentOrgs[iorg].exclusiveWorkerNodes);
						}
					}

					const freeNodes = exclusiveOrgWorkerNodes.filter(nodeData => alreadyUsedNodes.indexOf(nodeData.nodeHostName) === -1);
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
						validate: function (text) {
							if (text.length >= 3 && text.length <= 11) {
								return true;
							} else {
								return "Please type between 3 and 11 characters";
							}
						}
					},
					{
						name: 'ORGANIZATION_ADDRESS',
						message: 'Organization address:',
						default: osi4iotState.platformInfo.MAIN_ORGANIZATION_ADDRESS1,
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
						default: osi4iotState.platformInfo.MAIN_ORGANIZATION_CITY,
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
						default: osi4iotState.platformInfo.MAIN_ORGANIZATION_ZIP_CODE,
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
						default: osi4iotState.platformInfo.MAIN_ORGANIZATION_STATE,
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
						default: osi4iotState.platformInfo.MAIN_ORGANIZATION_COUNTRY,
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
						default: 1,
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
						name: 'ORGANIZATION_TELEGRAM_CHAT_ID',
						message: 'Telegram chat id for organization default group:',
						validate: function (telegramChatId) {
							let valid = false;
							if (telegramChatId !== "" && Number.isInteger(Number(telegramChatId))) valid = true;
							if (valid) {
								return true;
							} else {
								return "Please type an integer number";
							}
						}
					},
					{
						name: 'ORGANIZATION_TELEGRAM_INVITATION_LINK',
						message: 'Telegram invitation link for organization default group:',
						validate: function (url) {
							if (validUrl.isUri(url)) {
								return true;
							} else {
								return "Please type a valid url";
							}
						}
					},
					{
						name: 'ARE_ORG_SERVICES_DEPLOYED_IN_EXCLUSIVE_NODES',
						message: 'Will the organization services be deployed on exclusive worker nodes',
						type: "confirm",
						when: () => nodesData.length > 1 && workerNodesRows.length !== 0
					},
					{
						name: 'ORGANIZATION_EXCLUSIVE_WORKER_NODES',
						type: "table",
						message: "Choose the worker nodes for the organization",
						pageSize: workerNodesRows.length,
						columns: orgWorkerSelection,
						rows: workerNodesRows,
						when: (answers) => workerNodesRows.length !== 0 && answers.ARE_ORG_SERVICES_DEPLOYED_IN_EXCLUSIVE_NODES
					},
					{
						name: 'NUMBER_OF_MASTER_DEVICES_IN_ORG',
						message: 'Number of master devices in org:',
						default: 3,
						validate: function (numOfMD) {
							let valid = false;
							if (numOfMD !== "" && Number.isInteger(Number(numOfMD)) && Number(numOfMD) >= 1) valid = true;
							if (valid) {
								return true;
							} else {
								return "Please type an integer number greater or equal to one";
							}
						}
					},
					{
						name: 'ORG_ADMIN_FIRST_NAME',
						message: 'Org admin first name:',
						validate: function (platformName) {
							if (platformName.length >= 2) {
								return true;
							} else {
								return "Please type at least 2 characters";
							}
						}
					},
					{
						name: 'ORG_ADMIN_SURNAME',
						message: 'Org admin last name:',
						validate: function (platformName) {
							if (platformName.length >= 2) {
								return true;
							} else {
								return "Please type at least 2 characters";
							}
						}
					},
					{
						name: 'ORG_ADMIN_EMAIL',
						message: 'Org admin email:',
						validate: function (email) {
							const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)
							if (valid) {
								return true;
							} else {
								return "Please type a valid email";
							}
						}
					},
				])
				.then(async (answers) => {
					const orgExclusiveWorkerNodes = [];
					if (answers.ARE_ORG_SERVICES_DEPLOYED_IN_EXCLUSIVE_NODES && workerNodesRows.length !== 0) {
						for (let inode = 0; inode < workerNodesRows.length; inode++) {
							if (answers.ORGANIZATION_EXCLUSIVE_WORKER_NODES[inode] === "selected") {
								orgExclusiveWorkerNodes.push(workerNodesRows[inode].name)
							}
						}
					}
					answers.orgExclusiveWorkerNodes = orgExclusiveWorkerNodes;
					await requestCreateOrg(accessToken, osi4iotState, answers);
				})
				.catch((error) => {
					if (error.isTtyError) {
						console.log("Prompt couldn't be rendered in the current environment");
					} else {
						console.log("Error in osi4iot cli: ", error)
					}
				})
		} else {
			console.log("\n");
			chooseOption();
		}
	}
}

const requestCreateOrg = async (accessToken, osi4iotState, orgData) => {
	const optionsToken = {
		rejectUnauthorized: false,
		headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" }
	};

	const newOrg = {
		org_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
		org_acronym: orgData.ORGANIZATION_ACRONYM.toLowerCase(),
		exclusiveWorkerNodes: orgData.orgExclusiveWorkerNodes,
		master_devices: []
	}

	for (let idev = 1; idev <= orgData.NUMBER_OF_MASTER_DEVICES_IN_ORG; idev++) {
		newOrg.master_devices[idev - 1] = {
			client_crt: "",
			client_key: "",
			expiration_timestamp: 0,
			md_hash: nanoid(10).replace(/-/g, "x").replace(/_/g, "X"),
			is_volume_created: 'false'
		}
		newOrg.master_devices[idev - 1].client_crt_name = "";
		newOrg.master_devices[idev - 1].client_key_name = "";
	}

	const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
	let protocol = "https";
	if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "No certs") {
		protocol = "http";
	}
	const url = `${protocol}://${domainName}/admin_api/organization`;
	const createOrgData = {
		name: orgData.ORGANIZATION_NAME,
		acronym: orgData.ORGANIZATION_ACRONYM,
		address: orgData.ORGANIZATION_ADDRESS,
		city: orgData.ORGANIZATION_CITY,
		zipCode: orgData.ORGANIZATION_ZIP_CODE,
		state: orgData.ORGANIZATION_STATE,
		country: orgData.ORGANIZATION_COUNTRY,
		buildingId: parseInt(orgData.BUILDING_ID, 10),
		orgHash: newOrg.org_hash,
		masterDeviceHashes: newOrg.master_devices.map(md => md.md_hash),
		telegramInvitationLink: orgData.ORGANIZATION_TELEGRAM_INVITATION_LINK,
		telegramChatId: orgData.ORGANIZATION_TELEGRAM_CHAT_ID,
		orgAdminArray: [{
			firstName: orgData.ORG_ADMIN_FIRST_NAME,
			surname: orgData.ORG_ADMIN_SURNAME,
			email: orgData.ORG_ADMIN_EMAIL
		}]
	};

	const response = await needle('post', url, createOrgData, optionsToken)
		.then(res => res.body)
		.catch(err => console.log("Create org error: %s", err.message));

	if (response) {
		if (response.message === "Organization created successfully") {
			console.log(clc.greenBright("\nOrganization created successfully\n"));
			osi4iotState.certs.mqtt_certs.organizations.push(newOrg);

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
				const org_acronym = newOrg.org_acronym;
				const md_hashes_array = newOrg.master_devices.map(md => md.md_hash).join(",");
				await addNFSFolders(nfsNode, org_acronym, md_hashes_array);
			}

			await runStack(osi4iotState, dockerHost);
		} else {
			console.log(clc.redBright(`\nError: ${response.message}\n`));
			chooseOption();
		}
	}
}
