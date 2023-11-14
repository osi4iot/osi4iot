export default interface IMLModel {
	id?: number;
	orgId?: number;
	groupId: number;
	mlModelUid: string;
	description: string;
	mlLibrary: string;
	created?: string;
	updated?: string;
}