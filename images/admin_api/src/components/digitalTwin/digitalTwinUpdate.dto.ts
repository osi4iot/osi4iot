import { IsBoolean, IsNumber, IsString } from "class-validator";

class UpdateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public maxNumResFemFiles: number;

	@IsBoolean()
	public isGltfFileModified: boolean;

	@IsBoolean()
	public chatAssistantEnabled: boolean;

	@IsString()
	public chatAssistantLanguage: string;

	@IsString()
	public digitalTwinSimulationFormat: string;

	@IsString({ each: true })
	public sensorsRef: string[];
}

export default UpdateDigitalTwinDto;
