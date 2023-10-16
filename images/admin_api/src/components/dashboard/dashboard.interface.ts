export default interface IDashboard {
	id: number;
	orgId: number;
	groupId: number;
	slug: string;
	title: string;
	uid: string;
	data?: string;
	refresh: string;
	timeRangeFrom: string;
	timeRangeTo: string;
	created: string;
	updated: string;
}