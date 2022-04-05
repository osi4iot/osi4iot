export default interface IUserInOrgGrafana {
	orgId: number;
	userId: number;
	email: string;
	name: string;
	avatarUrl: string;
	login: string;
	role: string;
	lastSeenAt: string;
	lastSeenAtAge: string;
}
