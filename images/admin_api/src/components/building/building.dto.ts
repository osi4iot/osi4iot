import { IsNumber, IsString } from "class-validator";

class CreateBuildingDto {
	@IsString()
	public name: string;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;

	@IsString()
	public address: string;

	@IsString()
	public city: string;

	@IsString()
	public zipCode: string;

	@IsString()
	public state: string;

	@IsString()
	public country: string;

	@IsString()
	public geoJsonData: string;

	public outerBounds?: number[][];

	@IsString()
	public buildingFileName: string;

	@IsString()
	public buildingFileLastModifDate: string;
}

export default CreateBuildingDto;