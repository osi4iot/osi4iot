import fs from 'fs';
import clc from 'cli-color';
import execShellCommand from '../generic_tools/execShellCommand.js';
import findManagerDockerHost from './findManagerDockerHost.js';

export default async function () {
	if (!fs.existsSync('./osi4iot_state.json')) {
		console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
		return;
	} else {
		const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
		const osi4iotState = JSON.parse(osi4iotStateText);
		const dockerHost = findManagerDockerHost(osi4iotState.platformInfo.NODES_DATA);
		await execShellCommand(`docker ${dockerHost} stack rm osi4iot`);
	}
}