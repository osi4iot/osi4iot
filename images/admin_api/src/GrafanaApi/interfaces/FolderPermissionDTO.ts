// Body of Grafana's POST /api/folders/:uid/permissions: the folder's
// permissions, all of them (the ones not listed are removed). permission:
// 1 View, 2 Edit, 4 Admin.
export interface IFolderPermissionItem {
	teamId?: number;
	userId?: number;
	permission: number;
}

export default interface IFolderPermissionDTO {
	items: IFolderPermissionItem[];
}