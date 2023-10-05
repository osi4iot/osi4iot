import HttpException from "./HttpException";
import { Request, Response } from "express";

class NotValidUUIDv4Exception extends HttpException {
	constructor(
		req: Request,
		res: Response,
		itemName: string,
		id: string
	) {
		const message = `${itemName} id: '${id}' is not a valid uuid v4`;
		const statusCode = 400
		super(req, res, statusCode, message);
	}
}

export default NotValidUUIDv4Exception;
