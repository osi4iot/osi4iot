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
        getNodes(osi4iotState);

        console.log("\n");
        inquirer
            .prompt([
                {
                    name: "index",
                    message: "Select the index of the node you want to update:",
                    validate: function (index) {
                        if (index>= 1 && index <=nodesData.length ) {
                            return true;
                        } else {
                            return "Please type an index of the above table";
                        }
                    }
                }
            ])
            .then(async (answers) => {
                chooseOption();
            });
    }
}