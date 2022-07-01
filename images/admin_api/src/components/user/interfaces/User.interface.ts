export default interface IUser {
	id: number;
	name: string;
	firstName: string;
	surname: string;
	email: string;
	login: string;
	isGrafanaAdmin: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
	accesTokenExpirationDate?: number;
}