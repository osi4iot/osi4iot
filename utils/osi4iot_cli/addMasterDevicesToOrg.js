const fs = require('fs');
const inquirer = require('inquirer');
const runStack = require('./runStack');
const { nanoid } = require('nanoid');

module.exports = async () => {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.red("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        osi4iotState = JSON.parse(osi4iotStateText);
        const currentNumOrgs = osi4iotState.certs.mqtt_certs.organizations.length;
        const masterDevicesInOrgs = [];

        for (let iorg = 1; iorg <= currentNumOrgs ; iorg++) {
            const numMasterDevicesInOrg = osi4iotState.certs.mqtt_certs.organizations[iorg -1].master_devices.length
            const text = `Org ${iorg} - Num master devices: ${numMasterDevicesInOrg}`;
            masterDevicesInOrgs[iorg-1] = text
        }
        inquirer
            .prompt([
                {
                    name: 'selectedOrg',
                    message: 'Choose an org to add master devices: ',
                    default: 0,
                    type: 'rawlist',
                    choices: masterDevicesInOrgs
                },
                {
                    name: 'masterDevicesToAddInOrg',
                    message: `How many master devices do you want to add to the selected org?: `,
                    default: 1,
                    type: 'number'
                }
            ])
            .then(async (answers) => {
                if (answers.masterDevicesToAddInOrg !== 0) {
                    const orgIndex = masterDevicesInOrgs.indexOf(answers.selectedOrg);
                    const currentNumMasterDevicesInOrg = osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices.length
                    const newNumMasterDevicesInOrg = currentNumMasterDevicesInOrg + answers.masterDevicesToAddInOrg;
                    for (let idev = currentNumMasterDevicesInOrg; idev < newNumMasterDevicesInOrg; idev++) {
                        osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev] = {
                            client_crt: "",
                            client_key: "",
                            expiration_timestamp: 0,
                            md_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                            is_volume_created: 'false'
                        }
                        osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev].client_crt_name = "";
                        osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev].client_key_name = "";
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