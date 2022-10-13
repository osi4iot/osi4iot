import { IsNumber, IsString, ValidateIf } from "class-validator";

class CreateDeviceDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public iconRadio: number;

	@ValidateIf((obj) => obj.mqttPassword !== undefined)
	@IsString()
	public mqttPassword?: string;

	public mqttSalt?: string;

	@ValidateIf((obj) => obj.mqttAccessControl !== undefined)
	@IsString()
	public mqttAccessControl?: string;

	@ValidateIf((obj) => obj.masterDeviceUrl !== undefined)
	@IsString()
	public masterDeviceUrl?: string;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;
}

export default CreateDeviceDto;