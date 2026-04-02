export default interface IS3Folder {
	id?: number;
	orgId: number;
	groupId: number;
	groupUid: string;
	assetId: number;
	assetUid: string;
	folderName: string;
	lastS3Storage: string;
	parquetSchema: string;
	parquetFileCount: number;
	parquetTotalBytes: number;
	version: number;
	isCurrent: boolean;
	validFrom: string;
	validTo: string;
	created?: string;
	updated?: string;
}