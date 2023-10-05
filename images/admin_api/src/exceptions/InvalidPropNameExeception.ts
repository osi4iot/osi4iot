import HttpException from "./HttpException";
import { Request, Response } from "express";

class InvalidPropNameExeception extends HttpException {
	constructor(
		req: Request,
		res: Response,
		propName: string
	) {

		const message = `The propName: ${propName} is invalid`;
		const statusCode = 400
		super(req, res, statusCode, message);
	}
}

export default InvalidPropNameExeception;
