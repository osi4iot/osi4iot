export default interface IFloor {
	id?: number;
	buildingId: number;
	buildingName?: string;
	floorNumber: number;
	geoJsonData: string;
	outerBounds: number[][];
	floorFileName: string;
	floorFileLastModifDate: string;
	createdAtAge: string;
	updatedAtAge: string;
}