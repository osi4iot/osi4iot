import fs from 'fs';
import clc from "cli-color";
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { chooseOption } from '../menu/chooseOption.js';
import nodesConfiguration from './nodesConfiguration.js';
import joinNodesToSwarm from './joinNodesToSwarm.js';
import findManagerDockerHost from '../menu/findManagerDockerHost.js';
import generateNodeLabels from './generateNodeLabels.js';
import cleanSystemAndVolumes from '../menu/cleanSystemAndVolumes.js';
import swarmNodesQuestions from './swarmNodesQuestions.js';
import checkClusterRunViability from './checkClusterRunViability.js';
import updateServices from '../menu/updateServices.js';
import clearScreen from '../menu/clearScreen.js';

export default function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const currentNodesData = osi4iotState.platformInfo.NODES_DATA;
        const deploymentLocation = osi4iotState.platformInfo.DEPLOYMENT_LOCATION;
        if (currentNodesData && currentNodesData.length !== 0) {
            let defaultUserName = currentNodesData[currentNodesData.length - 1].nodeUserName;
            if (deploymentLocation === "AWS cluster deployment") {
                defaultUserName = "ubuntu";
            }
            inquirer
                .prompt([
                    {
                        name: "numNodesToAdd",
                        message: "Number of nodes to add to the cluster:",
                        validate: function (numNodesToAdd) {
                            if (currentNodesData.length === 1 && numNodesToAdd < 2) {
                                return "The minimum requirements for a multinode cluster are at least one manager node, one platform worker node and one generic org worker node."
                            } else {
                                return true;
                            }
                        }
                    },
                ])
                .then(async (answer) => {
                    const dockerHost = findManagerDockerHost(currentNodesData);
                    const numNodesToAdd = parseInt(answer.numNodesToAdd, 10);
                    let warnings = [];
                    let newNodes = [];
                    do {
                        newNodes = await swarmNodesQuestions(numNodesToAdd, currentNodesData, defaultUserName, deploymentLocation);
                        warnings = checkClusterRunViability([...currentNodesData, ...newNodes], deploymentLocation, osi4iotState.certs.mqtt_certs.organizations);
                        if (warnings.length !== 0) {
                            const warningsText = warnings.join("\n");
                            console.log(clc.yellowBright(`The indicated nodes configuration is not correct:\n${warningsText}`));
                            console.log(clc.greenBright(`\nPlease enter the nodes configuration again:`));
                        }
                    } while (warnings.length !== 0)

                    const status = "OK"
                    if (warnings.length === 0) {
                        try {
                            console.log(clc.green('\nConfigurating new nodes...'));
                            nodesConfiguration(newNodes);

                            console.log(clc.green('\nJoining nodes to swarm cluster:'));
                            await joinNodesToSwarm(newNodes, osi4iotState.platformInfo.DEPLOYMENT_LOCATION, dockerHost);

                            console.log(clc.green('\nRemoving previous docker images and volumes...'));
                            cleanSystemAndVolumes(newNodes);

                            const nfsServerNode = [...currentNodesData, ...newNodes].filter(node => node.nodeRole === "NFS server")[0];
                            if (nfsServerNode !== undefined) {
                                addNodesToNfsServer(newNodes, nfsServerNode);
                            }
                        } catch (err) {
                            console.log(clc.redBright("Error: ", err));
                            status = "Failed";
                        }

                        if (status === "OK") {
                            osi4iotState.platformInfo.NODES_DATA.push(...newNodes);
                            const osi4iotStateFile = JSON.stringify(osi4iotState);
                            fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);

                            console.log(clc.green('Generating node labels...\n'))
                            generateNodeLabels(osi4iotState, dockerHost);

                            console.log(clc.green('Updating services...\n'))
                            updateServices(dockerHost, newNodes, osi4iotState.certs.mqtt_certs.organizations);
                        }
                    } else {
                        const warningsText = warnings.join("\n");
                        console.log(clc.yellowBright(`The indicated node configuration is not correct:\n${warningsText}`))
                    }
                    console.log("");
                    chooseOption();
                });
        } else {
            clearScreen();
        }
    }
}

const addNodesToNfsServer = (newNodes, nfsServerNode) => {
    const nfsUserName = nfsServerNode.nodeUserName;
    const nodesData = newNodes.filter(node => node.nodeRole !== "NFS server")
    const nfsNodeIP = nfsServerNode.nodeIP;
    for (const nodeData of nodesData) {
        const newline = `/var/nfs_osi4iot ${nodeData.nodeIP}(rw,sync,no_root_squash,no_subtree_check)`;
        try {
            const etcExportFileLines = execSync(`ssh ${nfsUserName}@${nfsNodeIP} "cat /etc/exports"`).toString();
            if (!etcExportFileLines.includes(newline)) {
                execSync(`ssh ${nfsUserName}@${nfsNodeIP} 'echo "${newline}" | sudo tee -a /etc/exports'`);
            }
        } catch (err) {
            console.log(clc.redBright("Error adding node to nfs server: ", err));
        }
    }
}
