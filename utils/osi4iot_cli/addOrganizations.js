const fs = require('fs');
const inquirer = require('inquirer');
const runStack = require('./runStack');
const { nanoid } = require('nanoid');

module.exports = () => {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.red("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
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
                    type: 'number'
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
                    const osi4iotStateFile = JSON.stringify(osi4iotState);
                    fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
                }
                await runStack();
            })
            .catch((error) => {
                if (error.isTtyError) {
                    // Prompt couldn't be rendered in the current environment
                } else {
                    console.log("Error in osi4iot cli: ", error)
                }
            })


        //runStack(osi4iot)
    }
}