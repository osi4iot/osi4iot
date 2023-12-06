import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import execShellCommand from '../generic_tools/execShellCommand.js';
import findManagerDockerHost from './findManagerDockerHost.js';;
import clearScreen from './clearScreen.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const nodesData = osi4iotState.platformInfo.NODES_DATA;
		const numSwarmNodes = nodesData.length;
		if (nodesData && numSwarmNodes !== 0) {
			const dockerHost = findManagerDockerHost(osi4iotState.platformInfo.NODES_DATA);
			await execShellCommand(`docker ${dockerHost} stack rm osi4iot`);

			const networks = execSync(`docker ${dockerHost} network ls`);
			if (networks.toString().indexOf("traefik_public") === -1) {
				execSync(`docker ${dockerHost} network rm traefik_public`);
			}

			if (
				networks.toString().indexOf("agent_network") === -1 &&
				numSwarmNodes > 1 &&
				deploymentMode === "development"
			) {
				execSync(`docker ${dockerHost} network rm agent_network`);
			}

			if (networks.toString().indexOf("internal_net") === -1) {
				execSync(`docker ${dockerHost} network rm internal_net`);
			}

		} else {
			clearScreen();
		}
	}
}