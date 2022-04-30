import { execSync } from 'child_process';
import clc from 'cli-color';
import { chooseOption } from './chooseOption.js';

export default async function () {
	const response = execSync("docker service ls").toString();
	const numServices = response.split('\n').length - 2;
	if (numServices === 0) {
		console.log(clc.redBright("No stack has been deployed. \nUse the command 'osi4iot run' to deployed it."));
	} else {
		console.log(clc.whiteBright("\nServices running in the platform:\n"));
		console.log(response);
		console.log("");
		chooseOption();
	}
}