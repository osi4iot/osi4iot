import { IsNumber, IsString } from "class-validator";

class CreateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	@IsNumber()
	public sensorTypeId: number;

	@IsString()
	public payloadJsonSchema: string;
}

export default CreateSensorDto;