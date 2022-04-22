import { execSync } from 'child_process';
import clc from 'cli-color';

export default async function () {
	const response = execSync("docker service ls").toString();
	const numServices = response.split('\n').length - 2;
	if (numServices === 0) {
		console.log(clc.redBright("No stack has been deployed. \nUse the command 'osi4iot run' to deployed it."));
	} else {
		console.log("Services running in the platform:")
		console.log(response)
	}
}