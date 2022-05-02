import { execSync } from 'child_process';
import clc from 'cli-color';

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function (nodesData, deployLocation, dockerHost = null) {
	let outputResult = "OK";
	let joinWorkerCommand = "";
	let joinManagerCommand = "";
	if (dockerHost === null) {
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

				try {
					if (nodeIP === "localhost" || nodeIP === "127.0.0.1") {
						execSync(`docker swarm leave --force`, { stdio: 'ignore' });
					} else {
						execSync(`ssh ${userName}@${nodeIP} 'docker swarm leave --force'`, { stdio: 'ignore' });
					}
				} catch (error) {
					//do nothing
				}
				try {
					if (nodeRole === "Manager") {
						if (!isMainManagerJoined) {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							if (nodeIP === "localhost" || nodeIP === "127.0.0.1") {
								joinWorkerCommand = execSync(`docker swarm init`)
									.toString()
									.split("\n")[4]
									.trim();
								joinManagerCommand = execSync(`docker swarm join-token manager`)
									.toString()
									.split("\n")[2]
									.trim();
							} else {
								joinWorkerCommand = execSync(`ssh ${userName}@${nodeIP} 'docker swarm init'`)
									.toString()
									.split("\n")[4]
									.trim();
								joinManagerCommand = execSync(`ssh ${userName}@${nodeIP} 'docker swarm join-token manager'`)
									.toString()
									.split("\n")[2]
									.trim();
							}
							isMainManagerJoined = true;
							await sleep(1000);
						} else {
							console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
							execSync(`ssh ${userName}@${nodeIP} '${joinManagerCommand}'`)
						}
					} else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
						console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
						execSync(`ssh ${userName}@${nodeIP} '${joinWorkerCommand}'`);
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
					execSync(`ssh ${userName}@${nodeIP} 'docker swarm leave --force'`, { stdio: 'ignore' });
				} catch (error) {
					//do nothing
				}
				try {
					console.log(clc.green(`Joining node ${nodeHostName} to swarm ...`));
					if (nodeRole === "Manager") {
						execSync(`ssh ${userName}@${nodeIP} '${joinManagerCommand}'`)
					} else if (nodeRole === "Platform worker" || nodeRole === "Generic org worker" || nodeRole === "Exclusive org worker") {
						execSync(`ssh ${userName}@${nodeIP} '${joinWorkerCommand}'`);
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