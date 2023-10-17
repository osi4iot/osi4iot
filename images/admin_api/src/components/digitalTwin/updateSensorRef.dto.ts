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

	@ValidateIf((obj) => obj.type !== undefined)
	@IsString()
	public type: string;

	@ValidateIf((obj) => obj.description !== undefined)
	@IsString()
	public description: string;

	@ValidateIf((obj) => obj.payloadKey !== undefined)
	@IsString()
	public payloadKey: string;

	@ValidateIf((obj) => obj.paramLabel !== undefined)
	@IsString()
	public paramLabel: string;

	@ValidateIf((obj) => obj.valueType !== undefined)
	@IsString()
	public valueType: string;

	@ValidateIf((obj) => obj.units !== undefined)
	@IsString()
	public units: string;

	@ValidateIf((obj) => obj.dashboardRefresh !== undefined)
	@IsString()
	public dashboardRefresh: string;

	@ValidateIf((obj) => obj.dashboardTimeWindow !== undefined)
	@IsString()
	public dashboardTimeWindow: string;
}

export default UpdateSensorRefDto;