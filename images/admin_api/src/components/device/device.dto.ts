import { IsNumber, IsString } from "class-validator";

class CreateDeviceDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;
}

export default CreateDeviceDto;