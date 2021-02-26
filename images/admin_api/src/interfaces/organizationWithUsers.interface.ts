import IUserWithoutPassword from "./userWithoutPassword.interface";

interface IOrganizationWithUsers {
  organizationId: string;

  organizationnName: string;

  users: IUserWithoutPassword[];
}

export default IOrganizationWithUsers;
