import inquirer from 'inquirer';
import TablePrompt from 'inquirer-table-prompt';
import clc from "cli-color";
import Table from 'cli-table3';

class TablePromptMod extends TablePrompt {
	constructor(questions, rl, answers) {
		super(questions, rl, answers);
		if (questions.defaultValues !== undefined) {
			this.values = questions.defaultValues;
		}
	}

	onSpaceKey() {
		const value = this.columns.get(this.horizontalPointer).value;

		if (this.values[this.pointer] === undefined) {
			this.values[this.pointer] = value;
		} else {
			this.values[this.pointer] = undefined
		}
		this.spaceKeyPressed = true;
		this.render();
	}

	render(error) {
		let message = this.getQuestion();
		let bottomContent = "";

		if (!this.spaceKeyPressed) {
			message +=
				"(Press " +
				clc.cyanBright("<space>") +
				" to select, " +
				clc.cyanBright("<Up and Down>") +
				" to move rows, " +
				clc.cyanBright("<Left and Right>") +
				" to move columns)";
		}

		const [firstIndex, lastIndex] = this.paginate();
		const table = new Table({
			head: [
				clc.white(
					`${firstIndex + 1}-${lastIndex + 1} of ${this.rows.realLength}`
				)
			].concat(this.columns.pluck("name").map(name => clc.whiteBright(name)))
		});

		this.rows.forEach((row, rowIndex) => {
			if (rowIndex < firstIndex || rowIndex > lastIndex) return;

			const columnValues = [];

			this.columns.forEach((column, columnIndex) => {
				const isSelected =
					this.status !== "answered" &&
					this.pointer === rowIndex &&
					this.horizontalPointer === columnIndex;
				const value =
					column.value === this.values[rowIndex]
						? "x"
						: " ";

				columnValues.push(
					`${isSelected ? "[" : " "} ${value} ${isSelected ? "]" : " "}`
				);
			});

			const clcModifier =
				this.status !== "answered" && this.pointer === rowIndex
					? clc.cyanBright
					: clc.whiteBright;

			table.push({
				[clcModifier(row.name)]: columnValues
			});
		});

		message += "\n\n" + table.toString();

		if (error) {
			bottomContent = clc.red(">> ") + error;
		}

		this.screen.render(message, bottomContent);
	}
}

inquirer.registerPrompt("table", TablePromptMod);

export default inquirer;