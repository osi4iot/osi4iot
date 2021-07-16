import { IsString } from "class-validator";

class MeasurementRequestBodyDto {
	@IsString()
	public timestamp: string;

	@IsString()
	public topic: string;
}

export default MeasurementRequestBodyDto;