import HttpException from "./HttpException";
import { Request, Response } from "express";

class MLModelNotFoundException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		propName: string,
		propValue: string
	) {
		const message = `ML model with ${propName}: '${propValue}' is not found`;
		const statusCode = 404
		super(req, res, statusCode, message);
	}
}

export default MLModelNotFoundException;