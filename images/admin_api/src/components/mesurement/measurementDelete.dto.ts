import { IsString } from "class-validator";

class DeleteMeasurementDto {
	@IsString()
	public timestamp: string;

	@IsString()
	public topic: string;
}

export default DeleteMeasurementDto;