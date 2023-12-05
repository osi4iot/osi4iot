import needle from 'needle';
import fs from 'fs';
import clc from "cli-color";
import Table from 'cli-table3';
import login from '../menu/login.js';
import { chooseOption } from '../menu/chooseOption.js';

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
			let protocol = "https";
			if (osi4iotState.platformInfo.DOMAIN_CERTS_TYPE === "No certs") {
				protocol = "http";
			}
			const optionsToken = {
				headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" },
				rejectUnauthorized: false
			};
			const urlGetOrgs = `${protocol}://${domainName}/admin_api/organizations/user_managed`;
			const orgs = await needle('get', urlGetOrgs, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get org error: %s", err.message));

			const urlGetNodeRedInstances = `${protocol}://${domainName}/admin_api/nodered_instances`;
			const nodeRedInstances = await needle('get', urlGetNodeRedInstances, optionsToken)
				.then(res => res.body)
				.catch(err => console.log("Get nodered instance error: %s", err.message));

			const table = new Table({
				head: [
					clc.cyanBright('Id'),
					clc.cyanBright('Name'),
					clc.cyanBright('Acronym'),
					clc.cyanBright('Role'),
					clc.cyanBright('City'),
					clc.cyanBright('Country'),
					clc.cyanBright('Building Id'),
					clc.cyanBright('Org hash'),
					clc.cyanBright('Mqtt acc'),
					clc.cyanBright('Num nodered instances')
				],
				colWidths: [5, 30, 10, 10, 19, 19, 10, 15, 12, 13],
				wordWrap: true,
				style: { 'padding-left': 1, 'padding-right': 1 }
			});


			for (let iorg = 0; iorg < orgs.length; iorg++) {
				const numNodeRedInstancesInOrg = nodeRedInstances.filter(nri => nri.orgId === orgs[iorg].id).length;
				const row = [
					orgs[iorg].id,
					orgs[iorg].name,
					orgs[iorg].acronym,
					orgs[iorg].role,
					orgs[iorg].city,
					orgs[iorg].country,
					orgs[iorg].buildingId,
					orgs[iorg].orgHash,
					orgs[iorg].mqttAccessControl,
					numNodeRedInstancesInOrg
				];
				table.push(row);
			}

			console.log(table.toString());

		}
		console.log("\n");
		chooseOption();
	}
}