import { IsNumber, IsString } from "class-validator";


class CreateDeviceRefDto {
	@IsString()
	public deviceRef: string;

	@IsNumber()
	public deviceId: number;
}

export default CreateDeviceRefDto;