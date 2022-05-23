import fs from 'fs';
import os from 'os';
import clc from 'cli-color';
import { execSync } from 'child_process';
import inquirer from './generic_tools/inquirer.js';
import platformInitForm from './menu/platformInitForm.js';
import runStack from './menu/runStack.js';
import stopStack from './menu/stopStack.js';
import stackStatus from './menu/stackStatus.js';
import deletePlatform from './menu/deletePlatform.js';
import { chooseOption } from './menu/chooseOption.js';

const cliOptions = [
    '- init: Request information for configuration and initiate platform.',
    '- run: Update configuration if required and deploy platform.',
    '- stop: Stop all services in platform.',
    '- status: Show current state of the platform.',
    '- delete_platform: Stop all services and remove images and volumes in platform.',
];

const osi4iotCli = async () => {
    const myArgs = process.argv.slice(2);

    if (!fs.existsSync("./osi4iot_state.json")) {
        osi4iotWelcome();
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION === "On-premise cluster deployment") {
            try {
                const sshKeysOutput = execSync("ssh-add -l").toString();
                if (sshKeysOutput.search("./.osi4iot_keys/osi4iot_key (RSA)") === -1) {
                    loadSSHAgentWarnning();
                } else {
                    if (myArgs[0]) await argsOptions(myArgs[0]);
                    else chooseOption();
                }
            } catch (error) {
                loadSSHAgentWarnning();
            }
        } else {
            if (myArgs[0]) await argsOptions(myArgs[0]);
            else chooseOption();
        }
    }
}

const argsOptions = async (myArg) => {
    switch (myArg) {
        case 'init':
            platformInitForm();
            break;
        case 'run':
            await runStack();
            break;
        case 'stop':
            await stopStack();
            break;
        case 'status':
            await stackStatus();
            break;
        case 'delete_platform':
            deletePlatform();
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
}


const loadSSHAgentWarnning = () => {
    console.log(clc.yellowBright("\nBefore running osi4iot on a remote deploy is necessary to start the ssh-agent and load the key certificate files in it."));
    const platform = os.platform();
    if (platform === "linux") {
        console.log(clc.yellowBright("Type the following commands in the shell to get it:"));
        console.log(clc.whiteBright("\neval `ssh-agent -s` && ssh-add ./.osi4iot_keys/osi4iot_key\n"));
        console.log(clc.yellowBright("To remove the previous loaded keys type the following command:"));
        console.log(clc.whiteBright("\nssh-add -D\n"));
    } else if (platform === "win32") {
        console.log(clc.yellowBright("In Windows by default the ssh-agent service is disabled. Allow it to be manually started for the next step to work."));
        console.log(clc.yellowBright("Type the following command but make sure you're running as an Administrator:"));
        console.log(clc.whiteBright("\nGet-Service ssh-agent | Set-Service -StartupType Manual\n"));
        console.log(clc.yellowBright("To start the ssh-agent service and load the key files in it type the following command:"));
        console.log(clc.whiteBright("\nStart-Service sshd; ssh-add ./.osi4iot_keys/osi4iot_key\n"));
        console.log(clc.yellowBright("To remove the previous loaded keys type the following command:"));
        console.log(clc.whiteBright("\nssh-add -D\n"));
    } else {
        console.log(clc.redBright("\nError: Only linux and win32 platform are supported"));
    }
}

const osi4iotWelcome = () => {
    console.log(clc.whiteBright("\n****************************************"));
    console.log(clc.whiteBright("**     WELCOME TO OSI4IOT PLATFORM    **"));
    console.log(clc.whiteBright("****************************************\n"));

    inquirer
        .prompt([
            {
                name: "DEPLOYMENT_LOCATION",
                message: "Select the place of deployment of the platform:",
                type: 'list',
                default: "Local deployment",
                choices: ["Local deployment", "On-premise cluster deployment", "AWS cluster deployment"],
                validate: function (deployLocation) {
                    if (deployLocation === "Local deployment" || deployLocation === "On-premise cluster deployment") {
                        return true;
                    } else {
                        return "Deployment in AWS are not developed yet";
                    }
                }
            }
        ])
        .then(async (answers) => {
            if (answers.DEPLOYMENT_LOCATION === "AWS cluster deployment") {
                awsAccessKeys(answers);
            } else {
                answers.AWS_ACCESS_KEY_ID = "";
                answers.AWS_SECRET_ACCESS_KEY = "";
                createOsi4iotStateFile(answers);
                if (answers.DEPLOYMENT_LOCATION === "On-premise cluster deployment") {
                    console.log(clc.whiteBright("\nGenerating ssh keys:"));
                    const keys_dir = "./.osi4iot_keys";
                    if (!fs.existsSync(keys_dir)) {
                        fs.mkdirSync(keys_dir);
                    }
                    let isKeysCreationOK = true; 
                    //execSync("ssh-keygen -f ./.osi4iot_keys/osi4iot_key -t ed25519", { stdio: 'ignore' });
                    try {
                        execSync("ssh-keygen -f ./.osi4iot_keys/osi4iot_key -t rsa -b 4096", { stdio: 'inherit' });
                    } catch (err) {
                        isKeysCreationOK = false;
                    }

                    if (isKeysCreationOK) {
                        try {
                            const sshKeysOutput = execSync("ssh-add -l", { stdio: 'ignore' }).toString();
                            if (sshKeysOutput.search("./.osi4iot_keys/osi4iot_key (RSA)") === -1) {
                                loadSSHAgentWarnning();
                            } else {
                                chooseOption();
                            }
                        } catch (err) {
                            loadSSHAgentWarnning();
                        }
                    }

                } else {
                    console.log("");
                    chooseOption();
                }
            }
        });
};

const createOsi4iotStateFile = (answers) => {
    const osi4iotState = {
        platformInfo: {
            DEPLOYMENT_LOCATION: answers.DEPLOYMENT_LOCATION,
            AWS_ACCESS_KEY_ID: answers.AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: answers.AWS_SECRET_ACCESS_KEY,
        }
    }
    const osi4iotStateFile = JSON.stringify(osi4iotState);
    fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
}

const awsAccessKeys = (oldAnswers) => {
    inquirer
        .prompt([
            {
                name: 'AWS_ACCESS_KEY_ID',
                message: 'AWS access key id:',
                type: 'password',
                mask: "*",
            },
            {
                name: 'AWS_SECRET_ACCESS_KEY',
                message: 'AWS secret access key:',
                type: 'password',
                mask: "*"
            },
            {
                name: 'AWS_SSH_KEY',
                message: 'AWS ssh key:',
                type: 'editor',
            }
        ])
        .then(async (newAnswers) => {
            const answers = { ...oldAnswers, ...newAnswers };
            createOsi4iotStateFile(answers);
            const keys_dir = "./.osi4iot_keys";
            if (!fs.existsSync(keys_dir)) {
                fs.mkdirSync(keys_dir);
            }
            const osi4iot_aws_key = "./.osi4iot_keys/osi4iot_key"
            fs.writeFileSync(osi4iot_aws_key, answers.AWS_SSH_KEY, { mode: 0o400 });
            loadSSHAgentWarnning();
        });
}

osi4iotCli();