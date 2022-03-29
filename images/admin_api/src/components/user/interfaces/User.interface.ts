export default interface IUser {
	id: number;
	name: string;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	isGrafanaAdmin: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
	accesTokenExpirationDate?: number;
}