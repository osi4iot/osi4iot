import { IsNumber, IsString } from "class-validator";

class CreateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	sensorType: string;

	@IsNumber()
	public sensorTypeId: number;

	@IsString()
	public sensorRef: string;

	@IsString()
	public payloadJsonSchema: string;
}

export default CreateSensorDto;