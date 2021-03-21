import HttpException from "./HttpException";

class GroupNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `Group with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default GroupNotFoundException;