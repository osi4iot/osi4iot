export default interface IBuiliding {
	id?: number;
	name: string;
	longitude: number;
	latitude: number;
	geoJsonData: string;
	outerBounds: number[][];
	address: string;
	city: string;
	zipCode: string;
	state: string;
	country: string;
	buildingFileName: string;
	buildingFileLastModifDate: string;
	createdAtAge: string;
	updatedAtAge: string;
}