import { IsNumber, IsString, ValidateNested } from "class-validator";
import CreateDeviceRefDto from "./deviceRef.dto";
import { Type } from "class-transformer";
import CreateTopicRefDto from "./topicRef.dto";
import CreateSensorRefDto from "./sensorRef.dto";


class CreateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsString({each: true})
	public topicSensorTypes: string[];

	@IsNumber()
	public maxNumResFemFiles: number;

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

export default CreateDigitalTwinDto;