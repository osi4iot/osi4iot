export default interface IOrganization {
	id: number;
	name: string;
	acronym: string;
	address: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
	latitude: number;
	longitude: number;
	geoJsonData: string;
}

export interface IOrganizationWichTheLoggedUserIsUser extends IOrganization {
	roleInOrg: string;
}