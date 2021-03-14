export default interface IUserGlobalGrafana {
	id: number;
	name: string;
	login: string;
	email: string;
	avatarUrl: string;
	isGrafanaAdmin: boolean;
	isDisabled: boolean;
	lastSeenAt: string;
	lastSeenAtAge: string;
	authLabels: string[];
}
