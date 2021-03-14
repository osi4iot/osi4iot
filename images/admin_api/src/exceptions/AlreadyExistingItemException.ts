import HttpException from "./HttpException";

class AlreadyExistingItemException extends HttpException {
	constructor(article: string, entityName: string, itemNames: string[], itemValues: string[]) {
		let itemListString = "";
		for (let i = 0; i < itemNames.length; i++) {
			if (i > 0 && i <= (itemNames.length - 2)) {
				itemListString = `${itemListString}, `;
			} else if (i > 0 && (i === (itemNames.length - 1))) {
				itemListString = `${itemListString} and `;
			}
			itemListString = `${itemListString}${itemNames[i]}: '${itemValues[i]}'`;
		}
		super(409, `${article} ${entityName} with ${itemListString} already exists in database`);
	}
}

export default AlreadyExistingItemException;
