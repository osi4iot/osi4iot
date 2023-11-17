import { IsNumber, IsString, ValidateIf, } from "class-validator";

class UpdateSensorRefDto {
	@IsString()
	public sensorRef: string;

	@IsNumber()
	public sensorId: number;

	@IsNumber()
	public topicId: number;

	@ValidateIf((obj) => obj.topicRef !== undefined)
	@IsString()
	public topicRef: string;
}

export default UpdateSensorRefDto;