import { execSync } from 'child_process';
import clc from 'cli-color';

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function (nodesData, deployLocation, dockerHost = null) {
	let outputResult = "OK";
	let joinWorkerCommand = "";
	let joinManagerCommand = "";
	if (!dockerHost) {
		if (deployLocation === "Local deploy") {
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
			let isMainManagerJoined = false;
			for (let inode = 1; inode <= nodesData.length; inode++) {
				const userName = nodesData[inode - 1].nodeUserName;
				const nodeIP = nodesData[inode - 1].nodeIP;
				const nodeRole = nodesData[inode - 1].nodeRole;
				const nodeHostName = nodesData[inode - 1].nodeHostName;
				let host = `-H ssh://${userName}@${nodeIP}`;
				if (nodeIP === "localhost" || nodeIP === "127.0.0.1") host = "";

				try {
					execSync(`docker ${host} swarm leave --force`, { stdio: 'ignore' });
				} catch (error) {
					//do nothing
				}
				try {
					if (nodeRole === "Manager") {
						if (!isMainManagerJoined) {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							joinWorkerCommand = execSync(`docker ${host} swarm init`)
								.toString()
								.split("\n")[4]
								.trim();
							joinManagerCommand = execSync(`docker ${host} swarm join-token manager`)
								.toString()
								.split("\n")[2]
								.trim();
							isMainManagerJoined = true;
							await sleep(1000);
						} else {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							execSync(`ssh ${userName}@${nodeIP} '${joinManagerCommand}'`, { stdio: 'inherit' })
						}
					} else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
						console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
						execSync(`ssh ${userName}@${nodeIP} '${joinWorkerCommand}'`, { stdio: 'inherit' });
					}
				} catch (err) {
					console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.:`, err.toString()));
					outputResult = "Failed";
				}
			}
		}
	} else {
		try {
			joinWorkerCommand = execSync(`docker ${dockerHost} swarm join-token worker`)
				.toString()
				.split("\n")[2]
				.trim();

			joinManagerCommand = execSync(`docker ${dockerHost} swarm join-token manager`)
				.toString()
				.split("\n")[2]
				.trim();
		} catch (err) {
			console.log(clc.redBright(`Error retrieving the join command to the swarm:`, err.toString()));
			outputResult = "Failed";
		}

		if (outputResult == "OK") {
			for (let inode = 1; inode <= nodesData.length; inode++) {
				const userName = nodesData[inode - 1].nodeUserName;
				const nodeIP = nodesData[inode - 1].nodeIP;
				const nodeRole = nodesData[inode - 1].nodeRole;
				const nodeHostName = nodesData[inode - 1].nodeHostName;
				try {
					execSync(`docker ${dockerHost} swarm leave --force`, { stdio: 'ignore' });
				} catch (error) {
					//do nothing
				}
				try {
					if (nodeRole === "Manager") {
						if (!isMainManagerJoined) {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							joinWorkerCommand = execSync(`docker ${dockerHost} swarm init`)
								.toString()
								.split("\n")[4]
								.trim();
							joinManagerCommand = execSync(`docker ${dockerHost} swarm join-token manager`)
								.toString()
								.split("\n")[2]
								.trim();
							isMainManagerJoined = true;
							await sleep(1000);
						} else {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							execSync(`ssh ${userName}@${nodeIP} '${joinManagerCommand}'`, { stdio: 'inherit' })
						}
					} else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
						console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
						execSync(`ssh ${userName}@${nodeIP} '${joinWorkerCommand}'`, { stdio: 'inherit' });
					}
				} catch (err) {
					console.log(clc.redBright(`Error joining ${nodeHostName} node to swarm.:`, err.toString()));
					outputResult = "Failed";
				}
			}
		}
	}

	if (outputResult === "Failed") {
		throw new Error("Error joining nodes to swarm");
	}
}