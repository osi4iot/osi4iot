import { IsNumber, IsString } from "class-validator";

class CreateMasterDeviceDto {
	@IsString()
	public masterDeviceHash: string;

	@IsNumber()
	public orgId: number;
}

export default CreateMasterDeviceDto;