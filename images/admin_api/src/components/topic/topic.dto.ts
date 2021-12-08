import { IsString } from "class-validator";

class CreateTopicDto {
	@IsString()
	public topicType: string;

	@IsString()
	public topicName: string;

	@IsString()
	public description: string;

	@IsString()
	public payloadFormat: string;
}

export default CreateTopicDto;