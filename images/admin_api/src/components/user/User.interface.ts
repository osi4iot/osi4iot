export default interface IUser {
	id: number;
	name: string;
	login: string;
	email: string;
	telegramId: string;
	isGrafanaAdmin: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
}