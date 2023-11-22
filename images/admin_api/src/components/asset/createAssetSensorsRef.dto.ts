import { IsString } from "class-validator";

class CreateAssetSensorsRefDto {
	topicId?: number;

	@IsString()
	public sensorRef: string;

	sensorTypeId?: number;

	@IsString()
	public sensorType: string;

	@IsString()
	public topicRef: string;

	@IsString()
	public description: string;

	@IsString()
	public payloadJsonSchema: string;
}

export default CreateAssetSensorsRefDto;
