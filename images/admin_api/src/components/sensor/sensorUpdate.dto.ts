import { IsNumber, IsString } from "class-validator";

class UpdateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	@IsNumber()
	public sensorTypeId: number;

	@IsString()
	public payloadJsonSchema: string;
}

export default UpdateSensorDto;