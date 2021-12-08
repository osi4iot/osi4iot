import { IsString, IsNumber } from "class-validator";

class CreateDigitalTwinDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public dashboardId?: number;

	@IsString()
	public gltfData?: string;
}

export default CreateDigitalTwinDto;