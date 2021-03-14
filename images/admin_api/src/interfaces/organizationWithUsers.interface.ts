import IUserWithoutPassword from "./userWithoutPassword.interface";

interface IOrganizationWithUsers {
  orgId: string;

  organizationnName: string;

  users: IUserWithoutPassword[];
}

export default IOrganizationWithUsers;
