import HttpException from "./HttpException";
import { Request, Response } from "express";

class ItemNotFoundException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		itemName: string,
		propName: string,
		propValue: string
	) {
		const message = `${itemName} with ${propName}: '${propValue}' is not found`;
		const statusCode = 404
		super(req, res, statusCode, message);
	}
}

export default ItemNotFoundException;
