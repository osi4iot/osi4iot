import HttpException from "./HttpException";
import { Request, Response } from "express";

class InvalidPropValueException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		message: string
	) {

		const statusCode = 400
		super(req, res, statusCode, message);
	}
}

export default InvalidPropValueException;
