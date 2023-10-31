import fs from 'fs';
import os from 'os';
import clc from 'cli-color';
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
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

const dockerImagesVersions = ["dev", "1.1.0", "1.2.0", "latest"];
var argv = null;

const osi4iotCli = async () => {
    argv = yargs(hideBin(process.argv)).argv;
    if (!fs.existsSync("./osi4iot_state.json")) {
        osi4iotWelcome();
    } else {
        const osi4iotStateText = fs.readFileSync('./osi4iot_state.json', 'UTF-8');
        const osi4iotState = JSON.parse(osi4iotStateText);
        manageOptions(osi4iotState);
        if (osi4iotState.platformInfo.DEPLOYMENT_LOCATION !== "Local deployment") {
            try {
                const sshKeysOutput = execSync("ssh-add -l").toString();
                const username = execSync("whoami").toString().replace(/[\n\r]+/g, '').trim();
                const hostname = execSync("hostname").toString().replace(/[\n\r]+/g, '').trim();
                if (
                    sshKeysOutput.includes("./.osi4iot_keys/osi4iot_key (RSA)") ||
                    sshKeysOutput.includes(`${username}@${hostname} (RSA)`)
                ) {
                    if (argv._ !== undefined && argv._.length !== 0) await argsOptions(argv._[0]);
                    else chooseOption();
                } else {
                    loadSSHAgentWarnning();
                }
            } catch (error) {
                loadSSHAgentWarnning();
            }
        } else {
            if (argv._ !== undefined && argv._.length !== 0) await argsOptions(argv._[0]);
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
            await runStack(null, null, true);
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
    console.log(clc.whiteBright("\n************************************************"));
    console.log(clc.whiteBright("**   WELCOME TO OSI4IOT PLATFORM CLI v1.2.0X  **"));
    console.log(clc.whiteBright("************************************************\n"));

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
            },
            {
				name: 'S3_BUCKET_TYPE',
				message: 'Choose the type of S3 bucket to be used:',
				default: 'Local Minio',
				type: 'list',
				choices: [
					'Local Minio',
					"Cloud AWS S3",
                ],
                when: (answers) => answers.DEPLOYMENT_LOCATION !== "AWS cluster deployment",
                
			},
        ])
        .then(async (answers) => {
            if (answers.DEPLOYMENT_LOCATION === "AWS cluster deployment" || answers.S3_BUCKET_TYPE === "Cloud AWS S3" ) {
                awsQuestions(answers);
            } else {
                answers.AWS_ACCESS_KEY_ID = "";
                answers.AWS_SECRET_ACCESS_KEY = "";
                answers.AWS_REGION = "eu-west-3";
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
                        execSync("ssh-keygen -f ./.osi4iot_keys/osi4iot_key -t rsa -b 4096 -N ''", { stdio: 'inherit' });
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
    let s3BucketType = answers.S3_BUCKET_TYPE;
    if (answers.DEPLOYMENT_LOCATION === "AWS cluster deployment") {
        s3BucketType = "Cloud AWS S3";
    }
    const osi4iotState = {
        platformInfo: {
            DEPLOYMENT_MODE: "production",
            DEPLOYMENT_LOCATION: answers.DEPLOYMENT_LOCATION,
            S3_BUCKET_TYPE: s3BucketType,
            AWS_ACCESS_KEY_ID: answers.AWS_ACCESS_KEY_ID || "",
            AWS_SECRET_ACCESS_KEY: answers.AWS_SECRET_ACCESS_KEY || "",
            AWS_REGION: answers.AWS_REGION || "eu-west-3",
            DOCKER_IMAGES_VERSION: answers.DOCKER_IMAGES_VERSION || "1.2.0"
        }
    }
    const osi4iotStateFile = JSON.stringify(osi4iotState);
    fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
    manageOptions(osi4iotState);
}

const awsQuestions = (oldAnswers) => {
    const deploymentLocation = oldAnswers.DEPLOYMENT_LOCATION;
    const awsRegions = {
        "US East (Ohio)": "us-east-2",
        "US East (N. Virginia)": "us-east-1",
        "US West (N. California)": "us-west-1",
        "US West (Oregon)": "us-west-2",
        "Africa (Cape Town)": "af-south-1",
        "Asia Pacific (Hong Kong)": "ap-east-1",
        "Asia Pacific (Jakarta)": "ap-southeast-3",
        "Asia Pacific (Mumbai)": "ap-south-1",
        "Asia Pacific (Osaka)": "ap-northeast-3",
        "Asia Pacific (Seoul)": "ap-northeast-2	",
        "Asia Pacific (Singapore)": "ap-southeast-1",
        "Asia Pacific (Sydney)": "ap-southeast-2",
        "Asia Pacific (Tokyo)": "ap-northeast-1",
        "Canada (Central)": "ca-central-1",
        "Europe (Frankfurt)": "eu-central-1",
        "Europe (Ireland)": "eu-west-1",
        "Europe (London)": "eu-west-2",
        "Europe (Milan)": "eu-south-1",
        "Europe (Paris)": "eu-west-3",
        "Europe (Stockholm)": "eu-north-1",
        "Middle East (Bahrain)": "me-south-1",
        "Middle East (UAE)": "me-central-1",
        "South America (São Paulo)": "sa-east-1"
    }
    const awsKeys = Object.keys(awsRegions);

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
                name: 'AWS_REGION',
                message: 'AWS region:',
                type: 'list',
                default: "Europe (Paris)",
                choices: awsKeys,
                validate: function (awsRegion) {
                    awsRegionSelected = awsRegions[awsRegion];
                }
            },
            {
                name: 'AWS_SSH_KEY',
                message: 'AWS ssh key:',
                type: 'editor',
                when: () => deploymentLocation === "AWS cluster deployment",
            }
        ])
        .then(async (newAnswers) => {
            newAnswers.AWS_REGION = awsRegions[newAnswers.AWS_REGION];
            const answers = { ...oldAnswers, ...newAnswers };
            createOsi4iotStateFile(answers);
            if (deploymentLocation === "AWS cluster deployment") {
                const keys_dir = "./.osi4iot_keys";
                if (!fs.existsSync(keys_dir)) {
                    fs.mkdirSync(keys_dir);
                }
                const osi4iot_aws_key = "./.osi4iot_keys/osi4iot_key"
                fs.writeFileSync(osi4iot_aws_key, answers.AWS_SSH_KEY, { mode: 0o400 });
                loadSSHAgentWarnning();
            }
        });
}

const manageOptions = (osi4iotState) => {
    let areThereOptions = false;
    if (argv.v !== undefined) {
        if (dockerImagesVersions.indexOf(argv.v) !== -1) {
            osi4iotState.platformInfo.DOCKER_IMAGES_VERSION = argv.v;
            areThereOptions = true;
        }
    }

    if (argv.m !== undefined) {
        if (argv.m === "prod" || argv.m === "production") {
            osi4iotState.platformInfo.DEPLOYMENT_MODE = "production";
        } else if (argv.m === "dev" || argv.m === "development") {
            osi4iotState.platformInfo.DEPLOYMENT_MODE = "development";
        }
        areThereOptions = true;
    }

    if (areThereOptions) {
        const osi4iotStateFile = JSON.stringify(osi4iotState);
        fs.writeFileSync('./osi4iot_state.json', osi4iotStateFile);
    }
}

osi4iotCli();