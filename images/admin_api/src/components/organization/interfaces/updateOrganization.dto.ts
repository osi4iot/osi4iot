import { IsNumber, IsString } from "class-validator";

class UpdateOrganizationDto {
	id?: number;

	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsString()
	public address: string;

	@IsString()
	public city: string;

	@IsString()
	public zipCode: string;

	@IsString()
	public state: string;

	@IsString()
	public country: string;

	@IsNumber()
	public buildingId: number;

	@IsString()
	public orgHash: string;

	@IsString({each: true})
	public masterDeviceHashes: string[];
}

export default UpdateOrganizationDto;
