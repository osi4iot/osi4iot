import { IsEnum, IsNumber, IsString } from "class-validator";
import { OrgRoleOption, OrgRoleOptions } from "./orgRoleOptions";

class UpdateOrganizationDto {
	id?: number;

	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsEnum(OrgRoleOptions, { message: " 'Main', 'Generic' or 'Provider' are the only valid options for org role." })
	public role: OrgRoleOption;

	@IsNumber()
	public buildingId: number;

	@IsString()
	public orgHash: string;

	@IsString({each: true})
	public nriHashes: string[];

	@IsString()
	public mqttAccessControl: string;
}

export default UpdateOrganizationDto;
