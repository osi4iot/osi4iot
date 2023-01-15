export default interface IDataSource {
	id: number;
	uid: string;
	orgId: number;
	name: string;
	type: string;
	typeLogoUrl: string;
	access: string;
	url: string;
	password: string;
	user: string;
	database: string;
	basicAuth: string;
	basicAuthUser: string;
	basicAuthPassword: string;
	withCredential: boolean;
	isDefault: string;
	jsonData: Record<string, string | number>,
	secureJsonFields: {
		password: boolean;
	};
	readOnly: boolean;
	version: number;
}