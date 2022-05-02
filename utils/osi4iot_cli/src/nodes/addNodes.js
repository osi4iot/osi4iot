import fs from 'fs';
import clc from "cli-color";
import inquirer from 'inquirer';
import { chooseOption } from '../menu/chooseOption.js';
import nodesConfiguration from './nodesConfiguration.js';
import joinNodesToSwarm from '../menu/joinNodesToSwarm.js';
import generateNodeLabels from './generateNodeLabels.js';
import pruneSystemAndVolumes from '../menu/pruneSystemAndVolumes.js';
import swarmNodesQuestions from './swarmNodesQuestions.js';
import checkClusterRunViability from './checkClusterRunViability.js';

export default function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const defaultUserName = osi4iotState.platformInfo.PLATFORM_ADMIN_USER_NAME;
        const currentNodesData = osi4iotState.platformInfo.NODES_DATA;

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
                const numNodesToAdd = answer.numNodesToAdd;
                const newNodes = await swarmNodesQuestions(numNodesToAdd, currentNodesData, defaultUserName);
                const warnings = checkClusterRunViability([...currentNodesData, ...newNodes]);
                const status = "OK"
                if (warnings.length === 0) {
                    try {
                        console.log(clc.green('\nConfigurating new nodes...'));
                        nodesConfiguration(newNodes);
    
                        console.log(clc.green('\nJoining nodes to swarm:'));
                        joinNodesToSwarm(newNodes, osi4iotState.platformInfo.DEPLOY_LOCATION, dockerHost);
    
                        console.log(clc.green('\nRemoving previous docker images and volumes...'));
                        pruneSystemAndVolumes(newNodes);
                    } catch (err) {
                        console.log(clc.redBright("Error: ", err));
                        status = "Failed";
                    }
    
                    if (status === "OK") {
                        osi4iotState.platformInfo.NODES_DATA.push(...newNodes);
                        const osi4iotStateFile = JSON.stringify(osi4iotState);
                        fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
    
                        console.log(clc.green('Creating stack file...\n'))
                        stackFileGenerator(osi4iotState);
    
                        generateNodeLabels(osi4iotState, dockerHost);
    
                        await runStack(osi4iotState, dockerHost);
                    }
                } else {
                    const warningsText = warnings.join("\n");
                    console.log(clc.yellowBright(`The indicated node configuration is not correct:\n${warningsText}`))
                }
                console.log("");
                chooseOption();
            });
    }
}