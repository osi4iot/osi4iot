import HttpException from "./HttpException";

class MLModelNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `ML model with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default MLModelNotFoundException;