export default interface IOrganization {
	id: number;
	name: string;
	acronym: string;
	address: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
	buildingId: number;
	orgHash: string;
	mqttActionAllowed: string;
}

export interface IOrganizationWichTheLoggedUserIsUser {
	id: number;
	name: string;
	acronym: string;
	address: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
	buildingId: number;
	roleInOrg: string;
}