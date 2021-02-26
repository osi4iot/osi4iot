import HttpException from "./HttpException";

class UserNotFoundException extends HttpException {
  constructor(propName: string, propValue: string, institutionId?: string) {
    let message;
    if (propName === "id") {
      message = `User with id: ${propValue} is not found`;
    } else if (propName === "email") {
      message = `User with email: ${propValue} is not found`;
    } else if (propName === "dni") {
      message = `User with dni: ${propValue} is not found`;
    }
    if (institutionId) {
      message += ` in the institution with id: ${institutionId}`;
    }
    super(404, message);
  }
}

export default UserNotFoundException;
