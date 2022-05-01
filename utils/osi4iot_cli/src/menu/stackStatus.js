import { execSync } from 'child_process';
import clc from 'cli-color';
import { chooseOption } from './chooseOption.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const dockerHost = findManagerDockerHost(osi4iotState.platformInfo.NODES_DATA);

		const response1 = execSync(`docker ${dockerHost} node ls`).toString();
		const numSwarmNodes = response1.split('\n').length - 2;
		if (numSwarmNodes === 0) {
			console.log(clc.redBright("There is no node joined to the swarm cluster. \nUse the command 'osi4iot add_nodes' to get it."));
		} else {
			console.log(clc.whiteBright("\nNodes in the swarm cluster:\n"));
			console.log(response1);
		}

		const response2 = execSync(`docker ${dockerHost} service ls`).toString();
		const numServices = response2.split('\n').length - 2;
		if (numServices === 0) {
			console.log(clc.redBright("No stack has been deployed. \nUse the command 'osi4iot run' to deployed it."));
		} else {
			console.log(clc.whiteBright("\nServices running in the platform:\n"));
			console.log(response2);
		}

		console.log("");
		chooseOption();
	}
}