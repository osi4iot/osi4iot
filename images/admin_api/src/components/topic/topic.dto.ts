import { IsBoolean, IsString } from "class-validator";

class CreateTopicDto {
	@IsString()
	public topicType: string;

	@IsString()
	public description: string;

	@IsString()
	public payloadJsonSchema: string;

	@IsString()
	public mqttAccessControl: string;

	@IsBoolean()
	public requireS3Storage: boolean;

	@IsString()
	public s3Folder: string;

	@IsString()
	public parquetSchema: string;
}

export default CreateTopicDto;