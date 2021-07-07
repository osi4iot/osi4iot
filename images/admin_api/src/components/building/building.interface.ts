export default interface IBuiliding {
	id?: number;
	name: string;
	longitude: number;
	latitude: number;
	geoJsonData: string;
	timeFromCreation?: string;
	timeFromLastUpdate?: string;
}