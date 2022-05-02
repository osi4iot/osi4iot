import fs from 'fs';
import clc from "cli-color";
import getNodes from './getNodes.js';
import inquirer from 'inquirer';
import { chooseOption } from '../menu/chooseOption.js';
import checkClusterRunViability from './checkClusterRunViability.js';
import updateServices from '../menu/updateServices.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';

export default function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const nodesData = osi4iotState.platformInfo.NODES_DATA;
        getNodes(osi4iotState);

        inquirer
            .prompt([
                {
                    name: "index",
                    message: "Select the index of the node you want to remove:",
                    validate: function (index) {
                        if (index >= 1 && index <= nodesData.length) {
                            return true;
                        } else {
                            return "Please type an index of the above table";
                        }
                    }
                }
            ])
            .then(async (answers) => {
                const index = answers.index - 1;
                const newNodesData = nodesData.filter((node, idx) => idx !== index);
                const warnings = checkClusterRunViability(newNodesData, osi4iotState.certs.mqtt_certs.organizations);
                if (warnings.length === 0) {
                    const dockerHost = findManagerDockerHost(newNodesData);
                    const nodeToRemove = nodesData[index];

                    console.log(clc.green('Removing node from swarm cluster...\n'))
                    removeNodeOfSwarmCluster(dockerHost, nodeToRemove);

                    console.log(clc.green('Updating services...\n'));
                    updateServices(dockerHost, [nodeToRemove], osi4iotState.certs.mqtt_certs.organizations);

                    if (nodeToRemoveData.nodeRole === "Exclusive org worker") {
                        for (const org of osi4iotState.certs.mqtt_certs.organizations) {
                            if (org.exclusiveWorkerNodes.length !== 0) {
                                if (org.exclusiveWorkerNodes.includes(nodeToRemoveData.nodeHostName)) {
                                    org.exclusiveWorkerNodes = org.exclusiveWorkerNodes.filter(node => node !== nodeToRemove.nodeHostName);
                                }
                            }
                        }
                    }

                    osi4iotState.platformInfo.NODES_DATA = newNodesData;
                    const osi4iotStateFile = JSON.stringify(osi4iotState);
                    fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
                } else {
                    const warningsText = warnings.join("\n");
                    console.log(clc.yellowBright(`Can not be remove the indicated node:\n${warningsText}`))
                }
                console.log("");
                chooseOption();
            });

    }
}

const removeNodeOfSwarmCluster = (dockerHost, nodeData) => {
    const userName = nodeData.nodeUserName;
    const nodeIP = nodeData.nodeIP;
    const nodeHostName = nodeData.nodeHostName;
    try {
        execSync(`ssh ${userName}@${nodeIP} 'docker system prune --force'`);
        execSync(`docker ${dockerHost} node rm ${nodeHostName}`);
    } catch (err) {
        console.log(clc.redBright("Error removing node from swarm cluster: ", err));
    }
}