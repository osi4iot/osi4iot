import { IsString } from "class-validator";

class CreateDigitalTwinDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsString()
	public url: string;
}

export default CreateDigitalTwinDto;