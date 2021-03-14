interface IAddress {
	address1: string;
	address2: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
}

export default interface IOrganizationGrafana {
	id: number;
	name: string;
	address: IAddress
}