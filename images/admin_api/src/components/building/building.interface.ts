export default interface IBuiliding {
	id?: number;
	name: string;
	longitude: number;
	latitude: number;
	geoJsonData: string;
	outerBounds: number[][];
	timeFromCreation?: string;
	timeFromLastUpdate?: string;
}