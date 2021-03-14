import HttpException from "./HttpException";

class OrganizationNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `Organization with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default OrganizationNotFoundException;
