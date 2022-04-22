import { execSync } from 'child_process';
import execShellCommand from './execShellCommand.js';

export default async function () {
	const response = execSync("docker service ls");
	const numServices = response.toString().split('\n').length - 2;
	if (numServices !== 0) {
		await execShellCommand("docker stack rm osi4iot");
	}
	await execShellCommand("docker system prune --force");
	await execShellCommand("docker volume prune --force");
}