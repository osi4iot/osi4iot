import { spawn } from 'child_process';

export default function (cmd, options = {}) {
	console.log("options=", options);
	const commandParameters = cmd.split(" ").filter(param => param !== "");
	return new Promise(function (resolve, reject) {
		const child = spawn(commandParameters[0], [...commandParameters.slice(1)], options);
		child.stdout.on('data', (chunk) => {
			process.stdout.write(chunk.toString())
		});
		// since these are streams, you can pipe them elsewhere
		child.stderr.on('data', msg => {
			reject(msg.toString())
		});
		child.on('close', (code) => {
			resolve(code);
		});
	});
}