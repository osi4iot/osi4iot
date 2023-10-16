import { IsNumber, IsString } from "class-validator";

class CreateBuildingDto {
	@IsString()
	public name: string;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;

	@IsString()
	public geoJsonData: string;

	public outerBounds?: number[][];

	@IsString()
	public buildingFileName: string;

	@IsString()
	public buildingFileLastModifDate: string;
}

export default CreateBuildingDto;