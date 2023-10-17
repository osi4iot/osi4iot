import { IsNumber, IsString } from "class-validator";

class CreateSensorRefDto {
	@IsString()
	public sensorRef: string;

	@IsNumber()
	public sensorId: number;

	@IsString()
	public topicRef?: string;

	@IsString()
	public type?: string;

	@IsString()
	public description?: string;

	@IsString()
	public payloadKey?: string;

	@IsString()
	public paramLabel?: string;

	@IsString()
	public valueType?: string;

	@IsString()
	public units?: string;

	@IsString()
	public dashboardRefresh?: string;

	@IsString()
	public dashboardTimeWindow?: string;
}

export default CreateSensorRefDto;