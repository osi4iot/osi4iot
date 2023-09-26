import { IsString, ValidateIf } from "class-validator";

class CreateDeviceDto {
	@ValidateIf((obj) => obj.mqttPassword !== undefined)
	@IsString()
	public mqttPassword?: string;

	public mqttSalt?: string;

	@ValidateIf((obj) => obj.mqttAccessControl !== undefined)
	@IsString()
	public mqttAccessControl?: string;
}

export default CreateDeviceDto;