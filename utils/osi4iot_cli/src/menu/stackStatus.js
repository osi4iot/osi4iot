import fs from 'fs';
import { execSync } from 'child_process';
import clc from 'cli-color';
import { chooseOption } from './chooseOption.js';
import findManagerDockerHost from './findManagerDockerHost.js';
import clearScreen from './clearScreen.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const nodesData = osi4iotState.platformInfo.NODES_DATA;
		if (nodesData && nodesData.length) {
			const dockerHost = findManagerDockerHost(nodesData);
			try {
				const response1 = execSync(`docker ${dockerHost} node ls`).toString();
				const numSwarmNodes = response1.split('\n').length - 2;
				if (numSwarmNodes !== 0) {
					console.log(clc.greenBright("\nNodes joined to the swarm cluster:\n"));
					console.log(response1);

					const response2 = execSync(`docker ${dockerHost} service ls`).toString().split('\n');
					const services = response2.filter(line => !line.includes("osi4iot_system_prune"));
					const numServices = services.length - 2;
					if (numServices !== 0) {
						console.log(clc.greenBright("\nServices running in the platform:\n"));
						console.log(services.join('\n'));
					} else {
						console.log(clc.yellowBright("No stack has been deployed. \nUse the command 'osi4iot run' to deployed it."));
					}
				}
			} catch (err2) {
				console.log(clc.yellowBright("There is no node joined to the swarm cluster. \nUse the command 'osi4iot add_nodes' to get it.\n"));
			}

			console.log("");
			chooseOption();
		} else {
			clearScreen();
		}
	}
}