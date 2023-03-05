import { Type } from "class-transformer";
import { IsNumber, IsString, IsEnum, ValidateIf, ValidateNested } from "class-validator";
import CreateUserDto from "../../user/interfaces/User.dto";
import { OrgRoleOption, OrgRoleOptions } from "./orgRoleOptions";

class CreateOrganizationDto {
	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsEnum(OrgRoleOptions, { message: " 'Main', 'Generic' or 'Provider' are the only valid options for org role." })
	public role: OrgRoleOption;

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
	public nriHashes: string[];

	@ValidateIf((obj) => obj.telegramInvitationLink !== undefined)
	@IsString()
	public telegramInvitationLink?: string;

	@ValidateIf((obj) => obj.telegramChatId !== undefined)
	@IsString()
	public telegramChatId?: string;

	@IsString()
	public mqttAccessControl: string;

	@ValidateNested({ each: true })
	@Type(() => CreateUserDto)
	public orgAdminArray: CreateUserDto[];
}

export default CreateOrganizationDto;
