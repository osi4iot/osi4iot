export default interface ITeam {
	id: number;
	orgId: number,
	name: string;
	email: string;
	avatarUrl: string;
	memberCount: number;
	permission: number;
}