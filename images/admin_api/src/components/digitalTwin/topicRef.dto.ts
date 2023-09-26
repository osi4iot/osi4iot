import { IsNumber, IsString } from "class-validator";


class CreateTopicRefDto {
	@IsString()
	public topicRef: string;

	@IsNumber()
	public topicId: number;
}

export default CreateTopicRefDto;