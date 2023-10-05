import HttpException from "./HttpException";
import { Request, Response } from "express";

class UserNotFoundException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		propName: string,
		propValue: string,
		institutionId?: string
	) {
		let message;
		if (propName === "id") {
			message = `User with id: ${propValue} is not found`;
		} else if (propName === "email") {
			message = `User with email: ${propValue} is not found`;
		} else if (propName === "dni") {
			message = `User with dni: ${propValue} is not found`;
		}
		if (institutionId) {
			message += ` in the institution with id: ${institutionId}`;
		}
		const statusCode = 404
		super(req, res, statusCode, message);
	}
}

export default UserNotFoundException;
