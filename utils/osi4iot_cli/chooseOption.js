const inquirer = require('inquirer');
const platformInitForm = require('./platformInitForm');
const runStack = require('./runStack');
const stopStack = require('./stopStack');
const stackStatus = require('./stackStatus');
const cleanStack = require('./cleanStack');
const addOrganization = require('./addOrganizations');
const addMasterDevicesToOrg = require('./addMasterDevicesToOrg');

module.exports = () => {
    inquirer
        .prompt([
            {
                name: 'option',
                message: 'Choose one of the following options: ',
                default: 'Init platform',
                type: 'list',
                choices: [
                    'Init platform',
                    'Run platform',
                    'Add organization',
                    'Add master devices to org',
                    'Stop platform',
                    'Platform status',
                    'Clean platform',
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
                case 'Add organization':
                    await addOrganization();
                    break;
                case 'Add master devices to org':
                    await addMasterDevicesToOrg();
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