import IUserWithoutPassword from "./userWithoutPassword.interface";

interface ICreateUsersOutput {
  numInputedUser: number;

  numExistingUsers: number;

  numExistingUsersAddedToInstitution: number;

  numNewUsers: number;

  newUsers: IUserWithoutPassword[];
}

export default ICreateUsersOutput;
