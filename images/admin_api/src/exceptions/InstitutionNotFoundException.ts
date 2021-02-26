import HttpException from "./HttpException";

class InstitutionNotFoundException extends HttpException {
  constructor(propName: string, propValue: string) {
    const message = `Institution with ${propName}: '${propValue}' is not found`;
    super(404, message);
  }
}

export default InstitutionNotFoundException;
