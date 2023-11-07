declare module "s3-files" {
	export function connect(options: any): any;
	export function createKeyStream(folderPath: string, fileNames: string[]): any;
	export function createFileStream(keyStream: any, keepFolderStructure: boolean): any;
}