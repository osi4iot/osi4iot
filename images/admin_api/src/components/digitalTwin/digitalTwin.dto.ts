import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";


class CreateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public maxNumResFemFiles: number;

	@IsOptional()
	@IsBoolean()
	@IsString()
	public chatAssistantEnabled: boolean;

	@IsOptional()
	@IsString()
	public chatAssistantLanguage: string;

	@IsString()
	public digitalTwinSimulationFormat: string;

	@IsString({ each: true })
	public sensorsRef: string[];
}

export default CreateDigitalTwinDto;