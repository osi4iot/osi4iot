import needle from 'needle';
import fs from 'fs';
import clc from "cli-color";
import Table from 'cli-table3';
import { chooseOption } from '../menu/chooseOption.js';
import getOrganizations from './getOrganizations.js';
import getNodeRedInstances from './getNodeRedInstances.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const orgs = await getOrganizations();
		if (orgs.length !== 0) {
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
				colWidths: [5, 30, 15, 10, 19, 19, 10, 20, 12, 13],
				wordWrap: true,
				style: { 'padding-left': 1, 'padding-right': 1 }
			});

			const nodeRedInstances = await getNodeRedInstances();

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