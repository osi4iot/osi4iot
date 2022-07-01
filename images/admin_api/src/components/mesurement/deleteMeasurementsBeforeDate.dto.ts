import { IsString } from "class-validator";

class DeleteMeasurementsBeforeDateDto {
	@IsString()
	public topic: string;

	@IsString()
	public deleteDate: string;

}

export default DeleteMeasurementsBeforeDateDto;