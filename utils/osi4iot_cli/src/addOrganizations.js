const fs = require('fs');
const inquirer = require('inquirer');
const runStack = require('./runStack');
const { nanoid } = require('nanoid');
const clc = require("cli-color");
const execSync = require('child_process').execSync;
const updateAdminApiSecrets = require('./updateAdminApiSecrets');

module.exports = () => {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        osi4iotState = JSON.parse(osi4iotStateText);
        const currentNumOrgs = osi4iotState.certs.mqtt_certs.organizations.length;
        const defaultMaxNumMasterDevPerOrg = osi4iotState.platformInfo.DEFAULT_MAX_NUMBER_MASTER_DEVICES_PER_ORG;
        inquirer
            .prompt([
                {
                    name: 'numOrgsToAdd',
                    message: `Currently there are ${currentNumOrgs} orgs in the platform. How many orgs do you want to add?: `,
                    default: 1,
                    type: 'number',
                    validate: (newNum) => {
                        if ((newNum - Math.floor(newNum)) !== 0.0) {
                            return "Please enter an integer number greater or equal to 1."
                        }
                        if (newNum < 1) {
                            return "At least one organization must be added"
                        }
                        return true;
                    }
                }
            ])
            .then(async (answers) => {
                if (answers.numOrgsToAdd !== 0) {
                    await generateWorkerNodesLabelsAndRunStack(osi4iotState, currentNumOrgs, answers.numOrgsToAdd);
                }
            })
            .catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    console.log("Error in osi4iot cli: ", error)
                }
            })

    }
}

const generateWorkerNodesLabelsAndRunStack = async (osi4iotState, currentNumOrgs, numOrgsToAdd) => {
    const outputLines = execSync("docker node ls").toString().split('\n');
    const numSwarmNodes = outputLines.length - 2;

    if (numSwarmNodes > 1) {
        const currentWorkerNodes = [];
        const currentWorkerNodesRows = [];
        for (let iline = 1; iline < outputLines.length; iline++) {
            const lineWordsArray = outputLines[iline].split(' ').filter(elem => elem !== '').filter(elem => elem !== '*');
            if (lineWordsArray.length === 5 && lineWordsArray[3] === 'Active') {
                const value = currentWorkerNodes.length;
                const name = lineWordsArray[1];
                const nodeIndex = osi4iotState.platformInfo.WORKER_NODES.indexOf(name);
                const workerNodeRow = { name, value }
                if (nodeIndex !== -1) {
                    if (osi4iotState.platformInfo.WORKER_NODES_FUNCTION[nodeIndex] === "undefined") {
                        currentWorkerNodes.push(name);
                        currentWorkerNodesRows.push(workerNodeRow);
                    }
                } else {
                    currentWorkerNodes.push(name);
                    currentWorkerNodesRows.push(workerNodeRow);
                    osi4iotState.platformInfo.WORKER_NODES.push(name);
                    osi4iotState.platformInfo.WORKER_NODES_FUNCTION.push("undefined");
                }
            }
        }

        if (currentWorkerNodes.length !== 0) {
            const workerFunctionColumns = [];
            const orgIni = currentNumOrgs + 1;
            const orgEnd = currentNumOrgs + numOrgsToAdd
            for (let iorg = orgIni; iorg <= orgEnd; iorg++) {
                const workerFunctionColumn = {
                    name: `Org ${iorg}`,
                    value: `org_${iorg}`
                }
                workerFunctionColumns.push(workerFunctionColumn);
            }

            inquirer
                .prompt([
                    {
                        type: "table",
                        name: "workerNodesFunction",
                        message: "Choose the function of every worker node",
                        pageSize: currentWorkerNodesRows.length,
                        columns: workerFunctionColumns,
                        rows: currentWorkerNodesRows
                    }
                ])
                .then(async (answers) => {
                    for (let inode = 0; inode < workerNodesRows.length; inode++) {
                        if (answers.workerNodesFunction[inode] === undefined) {
                            answers.workerNodesFunction = "undefined";
                        }
                    }
                    for (let inode = 1; inode <= currentWorkerNodes.length; inode++) {
                        const workerNodeFunction = answers.workerNodesFunction[inode - 1];
                        const nodeName = currentWorkerNodes[inode - 1];
                        if (workerNodeFunction.slice(0, 3) === 'org') {
                            const labelString = execSync(`docker node inspect ${nodeName}`);
                            if (labelString.includes("platform_worker")) {
                                execSync(`docker node update --label-rm platform_worker ${nodeName}`);
                            }
                            const iorg = parseInt(workerNodeFunction.split("_")[1], 10);
                            const orgHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash;
                            execSync(`docker node update --label-add  org_hash=${orgHash} ${nodeName}`);
                            const nodeIndex = osi4iotState.platformInfo.WORKER_NODES.indexOf(nodeName);
                            osi4iotState.platformInfo.WORKER_NODES_FUNCTION[nodeIndex] = workerNodeFunction;
                        }
                    }
                    await updateSecretsAndRunStack(osi4iotState, currentNumOrgs, numOrgsToAdd);
                });
        } else {
            console.log(clc.yellowBright("There are no more worker nodes available."));
        }
    } else if (numSwarmNodes === 1) {
        await updateSecretsAndRunStack(osi4iotState, currentNumOrgs, numOrgsToAdd);
    }
}

const updateSecretsAndRunStack = async (osi4iotState, currentNumOrgs, numOrgsToAdd) => {
    for (let iorg = currentNumOrgs; iorg < (currentNumOrgs + numOrgsToAdd); iorg++) {
        osi4iotState.certs.mqtt_certs.organizations[iorg] = {
            org_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
            master_devices: []
        }
        for (let idev = 1; idev <= defaultMaxNumMasterDevPerOrg; idev++) {
            osi4iotState.certs.mqtt_certs.organizations[iorg].master_devices[idev - 1] = {
                client_crt: "",
                client_key: "",
                expiration_timestamp: 0,
                md_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                is_volume_created: 'false'
            }
            osi4iotState.certs.mqtt_certs.organizations[iorg].master_devices[idev - 1].client_crt_name = "";
            osi4iotState.certs.mqtt_certs.organizations[iorg].master_devices[idev - 1].client_key_name = "";
        }
    }
    updateAdminApiSecrets(osi4iotState);
    const osi4iotStateFile = JSON.stringify(osi4iotState);
    fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
    await runStack(osi4iotState);
}