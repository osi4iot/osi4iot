import HttpException from "./HttpException";

class InvalidPropNameExeception extends HttpException {
	constructor(propName: string) {
		const message= `The propName: ${propName} is invalid`;
		super(400, message);
	}
}

export default InvalidPropNameExeception;
