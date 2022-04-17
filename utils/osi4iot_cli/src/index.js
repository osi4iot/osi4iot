import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import platformInitForm from './platformInitForm.js';
import runStack from './runStack.js';
import stopStack from './stopStack.js';
import stackStatus from './stackStatus.js';
import cleanStack from './cleanStack.js';
import chooseOption from './chooseOption.js';
import addOrganizations from './addOrganizations.js';
import modifyNumMasterDevicesInOrg from './modifyNumMasterDevicesInOrg.js';

const cliOptions = [
    '- init: Request information for configuration and initiate platform.',
    '- run: Update configuration if required and deploy platform.',
    '- add_org: Add new organization and re-deploy platform.',
    '- num_mdevices: Modify the number of master devices in the selected org and re-deploy platform.',
    '- stop: Stop all services in platform.',
    '- clean: Stop all services and remove images and volumes in platform.',
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
        const keys_dir = "./.osi4iot_keys"
        if (!fs.existsSync(keys_dir)) {
            console.log(clc.whiteBright("\n****************************************"));
            console.log(clc.whiteBright("**     WELCOME TO OSI4IOT PLATFORM    **"));
            console.log(clc.whiteBright("****************************************\n"));
            console.log(clc.whiteBright("Generating ssh keys:"));
            fs.mkdirSync(keys_dir);
            execSync("ssh-keygen -f ./.osi4iot_keys/osi4iot_ed25519 -t ed25519", { stdio: 'ignore' });
            loadSSHAgentWarnning();
        } else {
            try {
                const sshKeysOutput = execSync("ssh-add -l").toString();
                if (sshKeysOutput.search("ED25519") === -1) {
                    loadSSHAgentWarnning();
                } else chooseOption();
            } catch (error) {
                loadSSHAgentWarnning();
            }

        }
    }
}

const loadSSHAgentWarnning = () => {
    console.log(clc.yellowBright("\nBefore running osi4iot is necessary to add ssh key certificates."));
    console.log(clc.yellowBright("Type the following commands in the shell to get it:"));
    console.log(clc.yellowBright("\neval `ssh-agent -s` && ssh-add ./.osi4iot_keys/osi4iot_ed25519\n"));
}

osi4iotCli();

