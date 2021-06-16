export default interface IMessage {
	id?: number;
	userId?: number;
	orgId?: number;
	teamId?: number;
	title?: string;
	message: string;
}
