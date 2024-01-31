import clc from 'cli-color';
import inquirer from '../generic_tools/inquirer.js';
import createCustomService from './createCustomService.js';
import listCustomServices from './listCustomServices.js';
import updateCustomService from './updateCustomService.js';
import removeCustomService from './removeCustomService.js';
import { chooseOption } from '../menu/chooseOption.js';
import clearScreen from '../menu/clearScreen.js';

export default function () {
    console.log(clc.greenBright ("Custom services management:\n"));
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
                    'List custom services',
                    'Create custom service',
                    'Update custom service',
                    'Remove custom service',
                    'Back to main menu'
                ]
            }
        ])
        .then(async (answers) => {
            switch (answers.option) {
                case 'List custom services':
                    await listCustomServices();
                    break;
                case 'Create custom service':
                    await createCustomService();
                    break;
                case 'Update custom service':
                    await updateCustomService();
                    break;
                case 'Remove custom service':
                    await removeCustomService();
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