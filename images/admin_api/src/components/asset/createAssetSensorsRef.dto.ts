import { IsNumber, IsString } from "class-validator";

class CreateAssetSensorsRefDto {
	@IsString()
	public sensorRef: string;

	@IsNumber()
	public sensorTypeId: number;

	@IsString()
	public topicRef: string;

	@IsString()
	public description: string;

	@IsString()
	public payloadJsonSchema: string;
}

export default CreateAssetSensorsRefDto;
