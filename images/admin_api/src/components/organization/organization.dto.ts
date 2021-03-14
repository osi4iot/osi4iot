import { IsString, ValidateIf } from "class-validator";

class CreateOrganizationDto {
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
}

export default CreateOrganizationDto;
