import inquirer from '../generic_tools/inquirer.js';
import os from 'os';
import { execSync } from 'child_process'
import platformInitForm from '../menu/platformInitForm.js';
import runStack from './runStack.js';
import stopStack from './stopStack.js';
import stackStatus from './stackStatus.js';
import deletePlatform from './deletePlatform.js';
import createOrganization from '../organizations/createOrganization.js';
import getOrganizations from '../organizations/getOrganizations.js';
import updateOrganization from '../organizations/updateOrganization.js';
import removeOrganization from '../organizations/removeOrganization.js';
import listNodes from '../nodes/listNodes.js';
import addNodes from '../nodes/addNodes.js';
import updateDomainCerts from './updateDomainCerts.js';
import removeNode from '../nodes/removeNode.js';
import clearScreen from './clearScreen.js';

export const chooseOption = () => {
	inquirer
		.prompt([
			{
				name: 'option',
				message: 'Choose one of the following options: ',
				default: 'Init platform',
				type: 'list',
				pageSize: 15,
				loop: false,
				choices: [
					'Init platform',
					'Run platform',
					'Clear screen',
					'List organizations',
					'Create organization',
					'Update organization',
					'Remove organization',
					'List nodes',
					'Add nodes',
					'Remove node',
					'Update domain certs',
					'Platform status',
					'Stop platform',
					'Delete platform',
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
				case 'Clear screen':
					clearScreen();
					break;
				case 'List organizations':
					await getOrganizations();
					break;
				case 'Create organization':
					await createOrganization();
					break;
				case 'Update organization':
					await updateOrganization();
					break;
				case 'Remove organization':
					await removeOrganization();
					break;
				case 'List nodes':
					await listNodes();
					break;
				case 'Add nodes':
					addNodes();
					break;
				case 'Remove node':
					removeNode();
					break;
				case 'Update domain certs':
					updateDomainCerts();
					break;
				case 'Platform status':
					await stackStatus();
					break;
				case 'Stop platform':
					await stopStack();
					break;
				case 'Delete platform':
					deletePlatform();
					break;
				case 'Exit':
					break;
			}

		})
		.catch((error) => {
			if (error.isTtyError) {
				console.log("Prompt couldn't be rendered in the current environment");
			} else {
				console.log("Error in osi4iot cli: ", error)
			}
		})
}
