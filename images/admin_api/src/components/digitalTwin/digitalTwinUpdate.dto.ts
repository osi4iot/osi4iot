import { IsBoolean, IsNumber, IsString, ValidateNested } from "class-validator";
import CreateDeviceRefDto from "./deviceRef.dto";
import CreateTopicRefDto from "./topicRef.dto";
import { Type } from "class-transformer";
import CreateSensorRefDto from "./sensorRef.dto";

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

	@ValidateNested({ each: true })
	@Type(() => CreateDeviceRefDto)
	public devicesRef: CreateDeviceRefDto[];

	@ValidateNested({ each: true })
	@Type(() => CreateTopicRefDto)
	public topicsRef: CreateTopicRefDto[];

	@ValidateNested({ each: true })
	@Type(() => CreateSensorRefDto)
	public sensorsRef: CreateSensorRefDto[];
}

export default UpdateDigitalTwinDto;