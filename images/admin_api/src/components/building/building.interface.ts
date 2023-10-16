export default interface IBuiliding {
	id?: number;
	name: string;
	longitude: number;
	latitude: number;
	geoJsonData: string;
	outerBounds: number[][];
	buildingFileName: string;
	buildingFileLastModifDate: string;
	createdAtAge: string;
	updatedAtAge: string;
}