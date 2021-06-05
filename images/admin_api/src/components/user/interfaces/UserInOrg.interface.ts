export default interface IUserInOrg {
	orgId: number;
	userId: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	roleInOrg: string;
	isGrafanaAdmin?: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
}