const inquirer = require('inquirer');
const platformInitForm = require('./platformInitForm');
const runStack = require('./runStack');
const stopStack = require('./stopStack');
const stackStatus = require('./stackStatus');
const cleanStack = require('./cleanStack');
const addOrganizations = require('./addOrganizations');
const modifyNumMasterDevicesInOrg = require('./modifyNumMasterDevicesInOrg');

module.exports = () => {
    inquirer
        .prompt([
            {
                name: 'option',
                message: 'Choose one of the following options: ',
                default: 'Init platform',
                type: 'list',
                pageSize: 8,
                loop: false,
                choices: [
                    'Init platform',
                    'Run platform',
                    'Add organizations',
                    'Modify number of master devices in org',
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