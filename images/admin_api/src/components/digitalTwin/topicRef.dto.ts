import { IsString } from "class-validator";


class CreateTopicRefDto {
	@IsString()
	public topicRef: string;
}

export default CreateTopicRefDto;