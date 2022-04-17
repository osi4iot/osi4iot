import inquirer from 'inquirer';
import platformInitForm from './platformInitForm.js';
import runStack from './runStack.js';
import stopStack from './stopStack.js';
import stackStatus from './stackStatus.js';
import cleanStack from './cleanStack.js';
import addOrganizations from './addOrganizations.js';
import modifyNumMasterDevicesInOrg from './modifyNumMasterDevicesInOrg.js';

export default function() {
    inquirer
        .prompt([
            {
                name: 'option',
                message: 'Choose one of the following options: ',
                default: 'Init platform',
                type: 'list',
                pageSize: 14,
                loop: false,
                choices: [
                    'Init platform',
                    'Run platform',
                    'List organizations',
                    'Create organization',
                    'Update organization',
                    'Remove organization',
                    'List nodes',
                    'Add node',
                    'Update node',
                    'Remove node',
                    'Stop platform',
                    'Platform status',
                    'Clean platform',
                    'Exit'
                ]

            }
        ])
        .then(async (answers) => {
            switch (answers.option) {
                case 'Init platform':
                    await platformInitForm();
                    break;
                case 'Run platform':
                    await runStack();
                    break;
                case 'Add organizations':
                    await addOrganizations();
                    break;
                case 'Modify number of master devices in org':
                    await modifyNumMasterDevicesInOrg();
                    break;
                case 'Stop platform':
                    await stopStack();
                    break;
                case 'Platform status':
                    await stackStatus();
                    break;
                case 'Clean platform':
                    await cleanStack();
                    break;
                case 'Exit':
                    break;
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