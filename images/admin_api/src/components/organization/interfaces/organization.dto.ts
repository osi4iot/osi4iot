import { Type } from "class-transformer";
import { IsNumber, IsString, IsEnum, ValidateIf, ValidateNested, IsBoolean } from "class-validator";
import CreateUserDto from "../../user/interfaces/User.dto";
import { OrgRoleOption, OrgRoleOptions } from "./orgRoleOptions";

class CreateOrganizationDto {
	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsEnum(OrgRoleOptions, { message: " 'Main', 'Generic' or 'Provider' are the only valid options for org role." })
	public role: OrgRoleOption;

	@IsNumber()
	public buildingId: number;

	@ValidateIf((obj) => obj.orgHash !== undefined)
	@IsString()
	public orgHash: string;

	@IsString()
	public mqttAccessControl: string;

	@IsBoolean()
	public llmEnabled: boolean;

	@IsString()
	@ValidateIf((obj) => obj.llmEnabled === true)
	public llmProviderUrl: string;

	@ValidateIf((obj) => obj.llmEnabled === true)
	@IsString()
	public llmProviderApiKey: string;

	public hashedLlmProviderApiKey?: string;

	@IsBoolean()
	public telegramEnabled?: boolean;

	@IsString()
	@ValidateIf((obj) => obj.telegramEnabled === true)
	public telegramBotToken?: string;

	public hashedTelegramBotToken?: string;
	public hashedTelegramWebhookSecretToken?: string;

	@ValidateNested({ each: true })
	@Type(() => CreateUserDto)
	public orgAdminArray: CreateUserDto[];
}

export default CreateOrganizationDto;
