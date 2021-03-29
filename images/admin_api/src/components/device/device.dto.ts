import { Type } from "class-transformer";
import { IsNumber, IsString, ValidateIf } from "class-validator";

class CreateDeviceDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;

}

export default CreateDeviceDto;