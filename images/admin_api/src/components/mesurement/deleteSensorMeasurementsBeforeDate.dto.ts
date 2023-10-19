import { IsString } from "class-validator";

class DeleteSensorMeasurementsBeforeDateDto {
	@IsString()
	public topic: string;

	@IsString()
	public payloadKey: string;

	@IsString()
	public deleteDate: string;

}

export default DeleteSensorMeasurementsBeforeDateDto;