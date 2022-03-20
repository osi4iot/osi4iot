const platformInitForm = require('./platformInitForm');
const runStack = require('./runStack');
const stopStack = require('./stopStack');
const stackStatus = require('./stackStatus');
const cleanStack = require('./cleanStack');
const chooseOption = require('./chooseOption');
const addOrganizations = require('./addOrganizations');
const addMasterDevicesToOrg = require('./modifyNumMasterDevicesInOrg');
var clc = require("cli-color");

const cliOptions = [
    '- init: Request information for configuration and initiate plataform.',
    '- run: Update configuration if required and deploy plataform.',
    '- add_org: Add new organization and re-deploy plataform.',
    '- num_mdevices: Modify the number of master devices in the selected org and re-deploy plataform.',
    '- stop: Stop all services in plataform.',
    '- clean: Stop all services and remove images and volumes in plataform.',
];

const osi4iotCli = async () => {
    const myArgs = process.argv.slice(2);

    if (myArgs[0]) {
        switch (myArgs[0]) {
            case 'init':
                await platformInitForm();
                break;
            case 'run':
                await runStack();
                break;
            case 'add_orgs':
                await addOrganizations();
                break;
            case 'num_mdevices':
                await addMasterDevicesToOrg();
                break;
            case 'stop':
                await stopStack();
                break;
            case 'status':
                await stackStatus();
                break;
            case 'clean':
                await cleanStack();
                break;
            case 'help':
                console.log(clc.yellowBright("The osi4iot cli syntax is:\n"));
                console.log(clc.yellowBright("osi4iot [option]\n"));
                console.log(clc.yellowBright("Posible options are:"));
                for (let i = 0; i < cliOptions.length; i++) {
                    console.log(clc.yellowBright(cliOptions[i]));
                }
                break;
            default:
                console.log(clc.yellowBright("Incorrect argument. Posible options are:"));
                for (let i = 0; i < cliOptions.length; i++) {
                    console.log(clc.yellowBright(cliOptions[i]));
                }

        }
    } else {
        chooseOption();
    }

}

osi4iotCli();

