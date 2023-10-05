import { Request, Response } from "express";
import HttpException from "./HttpException";

class AlreadyExistingItemException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		article: string,
		entityName: string,
		itemNames: string[],
		itemValues: string[]
	) {
		let itemListString = "";
		for (let i = 0; i < itemNames.length; i++) {
			if (i > 0 && i <= (itemNames.length - 2)) {
				itemListString = `${itemListString}, `;
			} else if (i > 0 && (i === (itemNames.length - 1))) {
				itemListString = `${itemListString} and `;
			}
			itemListString = `${itemListString}${itemNames[i]}: '${itemValues[i]}'`;
		}
		const message = `${article} ${entityName} with ${itemListString} already exists in database`;
		const statusCode = 409
		super(req, res, statusCode, message);
	}
}

export default AlreadyExistingItemException;
