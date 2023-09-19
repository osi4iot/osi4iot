import { IsNumber, IsString } from "class-validator";

class CreateSensorDto {
	@IsNumber()
	public assetId: number;

	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsNumber()
	public topicId: number;

	@IsString()
	public payloadKey: string;

	@IsString()
	public paramLabel: string;

	@IsString()
	public valueType: string;

	@IsString()
	public units: string;
}

export default CreateSensorDto;