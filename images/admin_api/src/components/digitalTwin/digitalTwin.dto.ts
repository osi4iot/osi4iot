import { IsNumber, IsString, ValidateNested } from "class-validator";
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

	@IsNumber()
	public maxNumResFemFiles: number;

	@IsString()
	public dtRefFileName: string;

	@IsString()
	public dtRefFileLastModifDate: string;

	@IsString()
	public digitalTwinSimulationFormat: string;

	@ValidateNested({ each: true })
	@Type(() => CreateTopicRefDto)
	public topicsRef: CreateTopicRefDto[];

	@ValidateNested({ each: true })
	@Type(() => CreateSensorRefDto)
	public sensorsRef: CreateSensorRefDto[];
}

export default CreateDigitalTwinDto;