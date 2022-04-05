import clc from 'cli-color';
import platformInitForm from './platformInitForm.js';
import runStack from './runStack.js';
import stopStack from './stopStack.js';
import stackStatus from './stackStatus.js';
import cleanStack from './cleanStack.js';
import chooseOption from './chooseOption.js';
import addOrganizations from './addOrganizations.js';
import modifyNumMasterDevicesInOrg from './modifyNumMasterDevicesInOrg.js';

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
                await modifyNumMasterDevicesInOrg();
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

