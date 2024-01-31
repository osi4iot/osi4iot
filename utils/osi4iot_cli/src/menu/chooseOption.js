import inquirer from '../generic_tools/inquirer.js';
import platformInitForm from '../menu/platformInitForm.js';
import runStack from './runStack.js';
import stopStack from './stopStack.js';
import stackStatus from './stackStatus.js';
import deletePlatform from './deletePlatform.js';
import organizationsManagment from '../organizations/organizationsManagment.js';
import customServicesManagment from '../custom_services/customServicesManagment.js'
import recoverNodeRedInstancesDeleted from '../organizations/recoverNodeRedInstancesDeleted.js';
import getCustomServices from '../custom_services/listCustomServices.js';
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
				pageSize: 16,
				loop: false,
				choices: [
					'Init platform',
					'Run platform',
					'Clear screen',
					'Organizations management',
					'Custom services management',
					'Recover nodered instances',
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
					chooseOption();
					break;
				case 'Organizations management':
					clearScreen();
					organizationsManagment();
					break;
				case 'Custom services management':
					clearScreen();
					customServicesManagment();
					break;
				case 'Recover nodered instances':
					await recoverNodeRedInstancesDeleted();
					break;
				case 'List custom services':
					await getCustomServices();
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
