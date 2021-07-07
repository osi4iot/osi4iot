import { IsBoolean, IsNumber, IsString, ValidateIf } from "class-validator";

class UpdateOrganizationDto {
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
	public longitude: number;

	@IsNumber()
	public latitude: number;

	@IsString()
	public geoJsonData: string;

	@IsNumber()
	public floorOrgId: number;
}

export default UpdateOrganizationDto;
