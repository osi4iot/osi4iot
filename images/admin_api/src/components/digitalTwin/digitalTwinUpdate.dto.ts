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

	@IsString()
	public digitalTwinSimulationFormat: string;
}

export default UpdateDigitalTwinDto;