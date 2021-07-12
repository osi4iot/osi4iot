import { IsString } from "class-validator";

class UpdateMeasurementDto {
	@IsString()
	public timestamp: string;

	@IsString()
	public topic: string;

	@IsString()
	public updatedPayload: string;
}

export default UpdateMeasurementDto;