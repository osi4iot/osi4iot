import { IsString } from "class-validator";

class CreateTopicDto {
	@IsString()
	public sensorName: string;

	@IsString()
	public description: string;

	@IsString()
	public topic: string;

	@IsString({each: true})
	public fieldNames: string[];

	@IsString({each: true})
	public fieldUnits: string[];
}

export default CreateTopicDto;