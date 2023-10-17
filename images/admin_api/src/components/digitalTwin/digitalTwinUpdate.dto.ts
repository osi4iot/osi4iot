import { IsBoolean, IsNumber, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import CreateTopicRefDto from "./topicRef.dto";
import UpdateSensorRefDto from "./updateSensorRef.dto";

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

	@IsString()
	public dtRefFileName: string;

	@IsString()
	public dtRefFileLastModifDate: string;

	@ValidateNested({ each: true })
	@Type(() => CreateTopicRefDto)
	public topicsRef: CreateTopicRefDto[];

	@ValidateNested({ each: true })
	@Type(() => UpdateSensorRefDto)
	public sensorsRef: UpdateSensorRefDto[];
}

export default UpdateDigitalTwinDto;