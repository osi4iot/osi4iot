import HttpException from "./HttpException";

class AsssetNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `Asset with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default AsssetNotFoundException;