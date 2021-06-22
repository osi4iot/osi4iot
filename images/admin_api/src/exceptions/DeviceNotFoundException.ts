import HttpException from "./HttpException";

class DeviceNotFoundException extends HttpException {
	constructor(propName: string, propValue: string) {
		const message = `Device with ${propName}: '${propValue}' is not found`;
		super(404, message);
	}
}

export default DeviceNotFoundException;