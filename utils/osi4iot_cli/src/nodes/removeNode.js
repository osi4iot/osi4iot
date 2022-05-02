import fs from 'fs';
import clc from "cli-color";
import getNodes from './getNodes.js';
import inquirer from 'inquirer';
import { chooseOption } from '../menu/chooseOption.js';

export default function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const nodesData = osi4iotState.platformInfo.NODES_DATA;
        getNodes(osi4iotState);

        console.log("\n");
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
                console.log("newNodesData=", newNodesData)
                const warnings = checkClusterRunViability(newNodesData);
                if (warnings.length === 0) {
                    const dockerHost = findManagerDockerHost(newNodesData);

                } else {
                    const warningsText = warnings.join("\n");
                    console.log(clc.yellowBright(`Can not be remove the indicated node:\n${warningsText}`))
                }
                console.log("");
                chooseOption();
            });

    }
}