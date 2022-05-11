import fs from 'fs';
import getNodes from './getNodes.js';
import { chooseOption } from '../menu/chooseOption.js';
import clearScreen from '../menu/clearScreen.js';

export default async function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        const nodesData = osi4iotState.platformInfo.NODES_DATA;
        if (nodesData && nodesData.length !== 0) {
            getNodes(osi4iotState);
            chooseOption();
        } else {
            clearScreen();
        }
    }
}