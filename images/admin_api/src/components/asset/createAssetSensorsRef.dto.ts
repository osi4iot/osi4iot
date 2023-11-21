import { IsNumber, IsString } from "class-validator";

class CreateAssetSensorsRefDto {
	topicId?: number;

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
