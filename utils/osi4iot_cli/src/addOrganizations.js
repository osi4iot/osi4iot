const fs = require('fs');
const inquirer = require('inquirer');
const runStack = require('./runStack');
const { nanoid } = require('nanoid');
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
                    for (let iorg = currentNumOrgs; iorg < (currentNumOrgs+answers.numOrgsToAdd) ; iorg++) {
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
                }
                await confirmWorkerNodesLabelsAndRunStack(osi4iotState, currentNumOrgs, numOrgsToAdd);
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

const confirmWorkerNodesLabelsAndRunStack = async (osi4iotState, currentNumOrgs, numOrgsToAdd) => {
    const numSwarmNodes = execSync("docker node ls").toString().split('\n').length - 2;
    if (numSwarmNodes === 1) {
        await runStack(osi4iotState);
    } else {
        console.log(clc.yellowBright("NOTE: Before continuing, type the following commands on the organization worker nodes:"));
        const orgIni = currentNumOrgs + 1;
        const orgEnd = currentNumOrgs + numOrgsToAdd;
        for (iorg = orgIni; iorg <= orgEnd; iorg++) {
            console.log(clc.yellowBright(`\nOrganization ${iorg}:`));
            const orgHash = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].org_hash;
            const command = `    docker node update --label-add org_hash=${orgHash}`
            console.log(clc.yellowBright(command));
        }
        console.log("");
    
        inquirer
            .prompt([{
                name: 'confirm_labels_added',
                type: 'confirm',
                message: 'Are new organization worker node labels added?',
            }
            ])
            .then(async (answers) => {
                if (answers.confirm_labels_added) {
                    await runStack(osi4iotState);
                }
            })
            .catch((error) => {
                if (error.isTtyError) {
                    console.log("Prompt couldn't be rendered in the current environment")
                } else {
                    console.log("Error in osi4iot cli: ", error)
                }
            });
    }
}