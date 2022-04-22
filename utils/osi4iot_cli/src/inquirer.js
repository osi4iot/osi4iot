import inquirer from 'inquirer';
import TablePrompt from 'inquirer-table-prompt';

class TablePromptMod extends TablePrompt {
	constructor(questions, rl, answers) {
		super(questions, rl, answers);
		if (questions.defaultValues !== undefined) {
			this.values = questions.defaultValues;
		}
	}
}

inquirer.registerPrompt("table", TablePromptMod);

export default inquirer;