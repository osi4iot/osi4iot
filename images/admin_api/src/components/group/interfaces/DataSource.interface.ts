export default interface IDatasource {
	id: number;
	ordId: number;
	version: number;
	type: string;
	name: string;
	access: string;
	url: string;
	password: string;
	user: string;
	database: string;
	basicAuth: boolean;
	basicAuthUser: boolean;
	basicAuthPassword: boolean;
	isDefault: boolean;
	jsonData: string;
	created: string;
	updated: string;
	withCredentials: string;
	secureJsonData: string;
	readOnly: boolean;
	uid: string;
}