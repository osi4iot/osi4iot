import { execSync } from 'child_process';

export default function (nodesData) {
	const numSwarmNodes = nodesData.length;
	let isLocalDeploy = false;
	if (numSwarmNodes === 1 && nodesData[0].nodeIP === "localhost") {
		isLocalDeploy = true;
	}
	let dockerHost = "";
	if (!isLocalDeploy) {
		if (numSwarmNodes == 1) {
			try {
				const outputLines = execSync(`docker -H ssh://${nodesData[0].nodeUserName}@${nodesData[0].nodeIP} node ls`).toString();
				if (outputLines !== 0 && !outputLines.includes("This node is not a swarm manager")) {
					dockerHost = `-H ssh://${nodesData[0].nodeUserName}@${nodesData[0].nodeIP}`;
				}
			} catch (err) {
				throw new Error("Could not be found an active manager for the cluster")
			}
			if (dockerHost === "") {
				throw new Error("Could not be found an active manager for the cluster")
			}
		} else {
			const managerNodes = nodesData.filter(node => node.nodeRole === "Manager");
			for (let inode = 0; inode < managerNodes.length; inode++) {
				const userName = managerNodes[inode].nodeUserName;
				const nodeIP = managerNodes[inode].nodeIP;
				try {
					const outputLines = execSync(`docker -H ssh://${userName}@${nodeIP} node ls`).toString().split('\n');
					if (outputLines !== "" && !outputLines.includes("This node is not a swarm manager")) {
						dockerHost = `-H ssh://${userName}@${nodeIP}`;
						break;
					}
				} catch (error) {
					//do nothing
				}
			}
			if (dockerHost === "") {
				throw new Error("Could not be found an active manager for the cluster")
			}
		}
	}
	return dockerHost;
}