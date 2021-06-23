import { IsString } from "class-validator";

class CreateTopicDto {
	@IsString()
	public sensorName: string;

	@IsString()
	public description: string;

	@IsString()
	public payloadFormat: string;
}

export default CreateTopicDto;