export default interface IUserInOrg {
	userId: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
	roleInOrg: string;
	isGrafanaAdmin?: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
}