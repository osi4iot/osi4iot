import fs from 'fs';
import { execSync } from 'child_process';
import clc from "cli-color";
import getNodes from './getNodes.js';
import inquirer from 'inquirer';
import { chooseOption } from '../menu/chooseOption.js';
import checkClusterRunViability from './checkClusterRunViability.js';
import updateServices from '../menu/updateServices.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import clearScreen from '../menu/clearScreen.js';

export default function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const nodesData = osi4iotState.platformInfo.NODES_DATA;
        if (nodesData && nodesData.length !== 0) {
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

                        console.log(clc.green('Removing node of swarm cluster...\n'))
                        await removeNodeOfSwarmCluster(dockerHost, nodeToRemove);

                        console.log(clc.green('Updating services...\n'));
                        updateServices(dockerHost, [nodeToRemove], osi4iotState.certs.mqtt_certs.organizations);

                        const nfsServerNode = newNodesData.filter(node => node.nodeRole === "NFS server")[0];
                        if (nfsServerNode !== undefined) {
                            const nodeToRemove = nodesData[index];
                            removeNodeOfNfsServer(nodeToRemove.nodeIP, nfsServerNode);
                        }

                        if (nodeToRemove.nodeRole === "Exclusive org worker") {
                            for (const org of osi4iotState.certs.mqtt_certs.organizations) {
                                if (org.exclusiveWorkerNodes.length !== 0) {
                                    if (org.exclusiveWorkerNodes.includes(nodeToRemove.nodeHostName)) {
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
        } else {
            clearScreen();
        }
    }
}

const removeNodeOfSwarmCluster = async (dockerHost, nodeData) => {
    const userName = nodeData.nodeUserName;
    const nodeIP = nodeData.nodeIP;
    const nodeHostName = nodeData.nodeHostName;
    try {
        execSync(`ssh ${userName}@${nodeIP} 'docker swarm leave --force'`);

        let swarmNodeListRows = execSync(`docker ${dockerHost} node ls`).toString().split("\n");
        let isNodeDown = swarmNodeListRows.filter(row => row.includes(nodeHostName) && row.includes("Down")).length !== 0;
        do {
            swarmNodeListRows = execSync(`docker ${dockerHost} node ls`).toString().split("\n");
            isNodeDown = swarmNodeListRows.filter(row => row.includes(nodeHostName) && row.includes("Down")).length !== 0;
        } while (!isNodeDown);

        execSync(`docker ${dockerHost} node rm ${nodeHostName}`);
    } catch (err) {
        console.log(clc.redBright("Error removing node of swarm cluster: ", err));
    }
}

const removeNodeOfNfsServer = (nfsServerNode, nodeIP) => {
    const nfsUserName = nfsServerNode.nodeUserName;
    const nfsNodeIP = nfsServerNode.nodeIP;
    const textToMatch = `nfs_osi4iot ${nodeIP}`
    try {
        execSync(`ssh ${nfsUserName}@${nfsNodeIP} "sudo sed -i '/${textToMatch}/d' /etc/exports"`);
    } catch (err) {
        console.log(clc.redBright("Error removing node of nfs server: ", err));
    }
}