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


			for (let iorg = 0; iorg < orgs.length; iorg++) {
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

		}
		console.log("\n");
		chooseOption();
	}
}