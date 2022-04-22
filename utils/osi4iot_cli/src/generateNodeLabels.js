import clc from "cli-color";

export default async function (osi4iotState, dockerHost) {
	const nodesData = osi4iotState.platformInfo.NODES_DATA;
	if (nodesData.length > 1) {
		console.log(clc.green("Generating node labels..."));
		const numManagerNodes = nodesData.filter(node => node.nodeRole === "Manager").length;
		const prioritiesArray = [300, 200, 100];
		let priorityIndex = 0;
		for (let inode = 0; inode < nodesData.length; inode++) {
			const nodeRole = nodesData[inode].nodeRole;
			const nodeName = nodesData[inode].nodeHostName;
			if (nodeRole === "Manager") {
				if (numManagerNodes > 1) {
					const priority = prioritiesArray[priorityIndex];
					execSync(`docker ${dockerHost} node update --label-add KEEPALIVED_PRIORITY=${priority} ${nodeName}`);
					priorityIndex++;
					removeNodeLabels(dockerHost, nodeName, ["platform_worker", "generic_org_worker", "org_hash"]);
				}
			} else if (nodeRole === "Platform worker") {
				execSync(`docker ${dockerHost} node update --label-add  platform_worker=true ${nodeName}`);
				removeNodeLabels(dockerHost, nodeName, ["KEEPALIVED_PRIORITY", "generic_org_worker", "org_hash"]);
			} else if (nodeRole === "Generic org worker") {
				execSync(`docker ${dockerHost} node update --label-add  generic_org_worker=true ${nodeName}`);
				removeNodeLabels(dockerHost, nodeName, ["KEEPALIVED_PRIORITY", "KEEPALIVED_PRIORITY", "org_hash"]);
			} else if (nodeRole === "Exclusive org worker") {
				const organizations = osi4iotState.certs.mqtt_certs.organizations;
				const org = organizations.filter(org => org.exclusiveWorkerNodes.indexOf(nodeName) !== -1)[0];
				if (org !== undefined) {
					const orgHash = org.org_hash;
					execSync(`docker ${dockerHost} node update --label-add org_hash=${orgHash} ${nodeName}`);
					removeNodeLabels(dockerHost, nodeName, ["platform_worker", "generic_org_worker", "KEEPALIVED_PRIORITY"]);
				}
			}
		}
	}
}

const removeNodeLabels = (dockerHost, nodeName, labelsArray) => {
	const labelString = execSync(`docker ${dockerHost} node inspect ${nodeName}`);
	for (let ilabel = 0; ilabel < labelsArray.length; ilabel++) {
		const label = labelsArray[ilabel];
		if (labelString.includes(label)) {
			execSync(`docker ${dockerHost} node update --label-rm ${label} ${nodeName}`);
		}
	}
}