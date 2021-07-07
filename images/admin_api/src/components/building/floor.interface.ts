export default interface IFloor {
	id?: number;
	buildingId: number;
	buildingName?: string;
	floorNumber: number;
	geoJsonData: string;
	timeFromCreation?: string;
	timeFromLastUpdate?: string;
}