export default interface IFloor {
	id?: number;
	buildingId: number;
	buildingName?: string;
	floorNumber: number;
	geoJsonData: string;
	outerBounds: number[][];
	timeFromCreation?: string;
	timeFromLastUpdate?: string;
}