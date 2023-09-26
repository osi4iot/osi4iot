import { IsString } from "class-validator";

class CreateTopicDto {
	@IsString()
	public topicType: string;

	@IsString()
	public description: string;

	@IsString()
	public mqttAccessControl: string;
}

export default CreateTopicDto;