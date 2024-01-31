import fs from 'fs';
import clc from "cli-color";
import Table from 'cli-table3';
import { chooseOption } from '../menu/chooseOption.js';
import customServicesManagment from './customServicesManagment.js';

export default async function () {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);

        if (osi4iotState.custom_services === undefined) {
            osi4iotState.custom_services = [];
            const osi4iotStateFile = JSON.stringify(osi4iotState);
            fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
        }

        if (osi4iotState.custom_services.length === 0) {
            console.log(clc.yellowBright("No custom service has been defined."));
            console.log("\n");
            chooseOption();
        } else {
            const table = new Table({
                head: [
                    clc.cyanBright('Service Ref'),
                    clc.cyanBright('Service name'),
                    clc.cyanBright('Org acronym'),
                    clc.cyanBright('Docker image'),
                    clc.cyanBright('CPU'),
                    clc.cyanBright('RAM'),
                    clc.cyanBright('Volume name'),
                    clc.cyanBright('Volume path'),
                    clc.cyanBright('Config file'),
                    clc.cyanBright('Secret file'),
                ],
                colWidths: [25, 20, 10, 20, 7, 7, 25, 20, 9, 9],
                wordWrap: true,
                style: { 'padding-left': 1, 'padding-right': 1 }
            });

            const services = osi4iotState.custom_services;

            for (let isvc = 0; isvc < services.length; isvc++) {
                const row = [
                    services[isvc].serviceRef,
                    services[isvc].serviceName,
                    services[isvc].orgAcronym,
                    services[isvc].dockerImage,
                    services[isvc].cpuRequired,
                    services[isvc].memRequired,
                    services[isvc].volumeName,
                    services[isvc].volumePath,
                    services[isvc].configData !== "" ? "Yes" : "No",
                    services[isvc].secretData !== "" ? "Yes" : "No",
                ];
                table.push(row);
            }

            console.log(table.toString());

            console.log("\n");
            customServicesManagment();
        }
    }
}