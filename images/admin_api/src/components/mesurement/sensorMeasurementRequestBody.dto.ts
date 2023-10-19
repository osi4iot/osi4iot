import { IsString } from "class-validator";

class SensorMeasurementRequestBodyDto {
	@IsString()
	public timestamp: string;

	@IsString()
	public topic: string;

	@IsString()
	public payloadKey: string;
}

export default SensorMeasurementRequestBodyDto;