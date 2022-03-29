const fs = require('fs');
const inquirer = require('inquirer');
const runStack = require('./runStack');
const { nanoid } = require('nanoid');
const updateAdminApiSecrets = require('./updateAdminApiSecrets');

module.exports = async () => {
    if (!fs.existsSync('./osi4iot_state.json')) {
        console.log(clc.redBright("The file osi4iot_state.json not exist. \nUse the command 'osi4iot init' to create it."));
        return;
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        osi4iotState = JSON.parse(osi4iotStateText);
        const currentNumOrgs = osi4iotState.certs.mqtt_certs.organizations.length;
        const masterDevicesInOrgs = [];
        let orgIndex = 0;

        for (let iorg = 1; iorg <= currentNumOrgs; iorg++) {
            const numMasterDevicesInOrg = osi4iotState.certs.mqtt_certs.organizations[iorg - 1].master_devices.length
            const text = `Org ${iorg} - Num master devices: ${numMasterDevicesInOrg}`;
            masterDevicesInOrgs[iorg - 1] = text
        }

        inquirer
            .prompt([
                {
                    name: 'selectedOrg',
                    message: 'Choose an org to modify the number of master devices: ',
                    default: 0,
                    type: 'rawlist',
                    choices: masterDevicesInOrgs,
                }
            ])
            .then(async (answers1) => {
                orgIndex = masterDevicesInOrgs.indexOf(answers1.selectedOrg);
                const previousNumMasterDevicesInOrg = osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices.length;
                inquirer
                    .prompt([
                        {
                            name: 'newNumMasterDevicesInOrg',
                            message: `How many master devices do you want for the selected org?: `,
                            default: previousNumMasterDevicesInOrg,
                            type: 'number',
                            validate: (newNum) => {
                                if ((newNum - Math.floor(newNum)) !== 0.0) {
                                    return "Please enter an integer number greater or equal to 1."
                                }
                                if (newNum < 1) {
                                    return "There must be at least one master device per org"
                                }
                                return true;
                            }
                        }
                    ])
                    .then(async (answers2) => {
                        const newNumMasterDevicesInOrg = answers2.newNumMasterDevicesInOrg;
                        if (newNumMasterDevicesInOrg !== previousNumMasterDevicesInOrg) {
                            osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices = [];
                            for (let idev = 0; idev <= newNumMasterDevicesInOrg; idev++) {
                                osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev - 1] = {
                                    client_crt: "",
                                    client_key: "",
                                    expiration_timestamp: 0,
                                    md_hash: nanoid(16).replace(/-/g, "x").replace(/_/g, "X"),
                                    is_volume_created: 'false'
                                }
                                osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev - 1].client_crt_name = "";
                                osi4iotState.certs.mqtt_certs.organizations[orgIndex].master_devices[idev - 1].client_key_name = "";
                            }
                            updateAdminApiSecrets(osi4iotState);
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