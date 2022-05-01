import { execSync } from 'child_process';
import clc from 'cli-color';

export default function (nodesData) {
	const numNodes = nodesData.length;
	let outputResult = "OK";
	if (numNodes === 1) {
		const userName = nodesData[0].nodeUserName;
		const nodeIP = nodesData[0].nodeIP;
		const nodeHostName = nodesData[0].nodeHostName;
		if (nodeIP === "localhost") {
			try {
				console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
				execSync("docker swarm leave --force", { stdio: 'ignore' });
			} catch (error) {
				//do nothing
			}
			try {
				console.log(clc.green('Joining localhost to swarm...'));
				execSync("docker swarm init", { stdio: 'ignore' });
			} catch (err) {
				console.log(clc.redBright('Error joining localhost to swarm.'));
				outputResult = "Failed";
			}
		} else {
			try {
				execSync(`docker -H ssh://${userName}@${nodeIP} swarm leave --force`, { stdio: 'ignore' });
			} catch (error) {
				//do nothing
			}
			try {
				console.log(clc.green(`Joining node ${nodeHostName} to swarm...`));
				execSync(`docker -H ssh://${userName}@${nodeIP} swarm init`, { stdio: 'ignore' });
			} catch (err) {
				console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.`));
				outputResult = "Failed";
			}
		}
	} else {
		let joinWorkerCommand = "";
		let joinManagerCommand = "";
		let isMainManagerJoined = false;
		for (let inode = 1; inode <= nodesData.length; inode++) {
			const userName = nodesData[inode - 1].nodeUserName;
			const nodeIP = nodesData[inode - 1].nodeIP;
			const nodeRole = nodesData[inode - 1].nodeRole;
			const nodeHostName = nodesData[inode - 1].nodeHostName;
			let dockerHost = `-H ssh://${userName}@${nodeIP}`;
			if (nodeIP === "localhost") dockerHost = "";

			try {
				execSync(`docker ${dockerHost} swarm leave --force`, { stdio: 'ignore' });
			} catch (error) {
				//do nothing
			}
			try {
				if (nodeRole === "Manager") {
					if (!isMainManagerJoined) {
						console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
						joinWorkerCommand = execSync(`docker ${dockerHost}} swarm init`)
							.toString()
							.split("\n")[4]
							.trim();
						joinManagerCommand = execSync(`docker ${dockerHost} swarm join-token manager`)
							.toString()
							.split("\n")[2]
							.trim();
						isMainManagerJoined = true;
					} else {
						console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
						execSync(joinManagerCommand, { stdio: 'ignore' })
					}
				} else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
					console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
					execSync(joinWorkerCommand, { stdio: 'ignore' });
				}
			} catch (err) {
				console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.`));
				outputResult = "Failed";
			}
		}
	}

	if (outputResult === "Failed") {
		throw new Error("Error joining nodes to swarm");
	}
}