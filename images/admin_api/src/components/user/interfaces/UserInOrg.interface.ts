export default interface IUserInOrg {
	userId: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
	roleInOrg: string;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
}