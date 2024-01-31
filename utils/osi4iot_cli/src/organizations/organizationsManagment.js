import clc from 'cli-color';
import inquirer from '../generic_tools/inquirer.js';
import createOrganization from './createOrganization.js';
import listOrganizations from './listOrganizations.js';
import updateOrganization from './updateOrganization.js';
import removeOrganization from './removeOrganization.js';
import { chooseOption } from '../menu/chooseOption.js';
import clearScreen from '../menu/clearScreen.js';


export default function () {
    console.log(clc.greenBright ("Organizations management:\n"));
    inquirer
        .prompt([
            {
                name: 'option',
                message: 'Choose one of the following options: ',
                default: 'List organizations',
                type: 'list',
                pageSize: 5,
                loop: false,
                choices: [
                    'List organizations',
                    'Create organization',
                    'Update organization',
                    'Remove organization',
                    'Back to main menu'
                ]
            }
        ])
        .then(async (answers) => {
            switch (answers.option) {
                case 'List organizations':
                    await listOrganizations();
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
                case 'Back to main menu':
                    clearScreen();
                    chooseOption();
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