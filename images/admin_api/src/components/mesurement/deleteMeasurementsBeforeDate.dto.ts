import { IsString } from "class-validator";

class DeleteMeasurementsBeforeDateDto {
	@IsString()
	public deleteDate: string;

	@IsString()
	public topic: string;
}

export default DeleteMeasurementsBeforeDateDto;