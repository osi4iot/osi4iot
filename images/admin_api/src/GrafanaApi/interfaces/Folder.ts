export default interface IFolder {
	id: number;
	uid: string;
	url: string;
	title: string;
	hasAcl: boolean;
	canSave: boolean;
	canEdit: boolean;
	createdBy: string;
	created: string;
	updatedBy: string;
	updated: string;
	version: number;
}
