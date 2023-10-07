import { IsNumber, IsString } from "class-validator";

class CreateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	@IsString()
	public payloadKey: string;

	@IsString()
	public paramLabel: string;

	@IsString()
	public valueType: string;

	@IsString()
	public units: string;

	@IsString()
	public dashboardRefresh: string;

	@IsString()
	public dashboardTimeWindow: string;
}

export default CreateSensorDto;