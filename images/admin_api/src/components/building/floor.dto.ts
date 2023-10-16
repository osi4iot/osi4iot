import { IsNumber, IsString } from "class-validator";

class CreateFloorDto {
	@IsNumber()
	public buildingId: number;

	@IsNumber()
	public floorNumber: number;

	@IsString()
	public geoJsonData: string;

	public outerBounds?: number[][];

	@IsString()
	public floorFileName: string;

	@IsString()
	public floorFileLastModifDate: string;
}

export default CreateFloorDto;