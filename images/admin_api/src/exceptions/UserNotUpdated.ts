import HttpException from "./HttpException";
import { Request, Response } from "express";

class UserNotUpdatedException extends HttpException {
	constructor(
		req: Request,
		res: Response,
		propName: string,
		propValue: string,
		property: string,
		institutionId?: string
	) {
		let message;
		if (propName === "id") {
			message = `The property: ${property} of the user with id: ${propValue} could not be updated`;
		} else if (propName === "login") {
			message = `The property: ${property} of the user with login: ${propValue} could not be updated`;
		} else if (propName === "email") {
			message = `The property: ${property} of the user with email: ${propValue} could not be updated`;
		}
		if (institutionId) {
			message += ` in the organization with id: ${institutionId}`;
		}
		const statusCode = 404
		super(req, res, statusCode, message);
	}
}

export default UserNotUpdatedException;