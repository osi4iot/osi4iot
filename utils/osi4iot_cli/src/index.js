import fs from 'fs';
import os from 'os';
import clc from 'cli-color';
import { execSync } from 'child_process';
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
	'- clean: Stop all services and remove images and volumes in platform.',
];

const osi4iotCli = async () => {
	const myArgs = process.argv.slice(2);

	execSync(`ssh dicapua@192.168.1.77 'sudo bash docker_install.sh'`, { stdio: 'inherit' });

	if (myArgs[0]) {
		switch (myArgs[0]) {
			case 'init':
				await platformInitForm();
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
	console.log(clc.yellowBright("\nBefore running osi4iot is necessary to start the ssh-agent and load the key certificate files in it."));
	const platform = os.platform();
	if (platform === "linux") {
		console.log(clc.yellowBright("Type the following commands in the shell to get it:"));
		console.log(clc.whiteBright("\neval `ssh-agent -s` && ssh-add ./.osi4iot_keys/osi4iot_ed25519\n"));
		console.log(clc.yellowBright("To remove the previous loaded keys type the following command:"));
		console.log(clc.whiteBright("\nssh-add -D\n"));
	} else if (platform === "win32") {
		console.log(clc.yellowBright("In Windows by default the ssh-agent service is disabled. Allow it to be manually started for the next step to work."));
		console.log(clc.yellowBright("Type the following command but make sure you're running as an Administrator:"));
		console.log(clc.whiteBright("\nGet-Service ssh-agent | Set-Service -StartupType Manual\n"));
		console.log(clc.yellowBright("To start the ssh-agent service and load the key files in it type the following command:"));
		console.log(clc.whiteBright("\nStart-Service sshd; ssh-add ./.osi4iot_keys/osi4iot_ed25519\n"));
		console.log(clc.yellowBright("To remove the previous loaded keys type the following command:"));
		console.log(clc.whiteBright("\nssh-add -D\n"));
	} else {
		console.log(clc.redBright("\nError: Only linux and win32 platform are supported"));
	}
}

osi4iotCli();

