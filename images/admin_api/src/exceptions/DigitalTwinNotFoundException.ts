import HttpException from "./HttpException";

class DigitalTwinNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `Digital twin with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default DigitalTwinNotFoundException;