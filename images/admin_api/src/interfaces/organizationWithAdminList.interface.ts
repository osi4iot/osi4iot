import IUserWithoutPassword from "./userWithoutPassword.interface";

interface IOrganizationWithAdminList {
  id: string;

  name: string;

  acronym: string;

  geometry: string;

  administratorsList: IUserWithoutPassword[];
}

export default IOrganizationWithAdminList;
