import HttpException from "./HttpException";

class UserNotUpdatedException extends HttpException {
	constructor(propName: string, propValue: string, property: string, institutionId?: string) {
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
		super(404, message);
	}
}

export default UserNotUpdatedException;