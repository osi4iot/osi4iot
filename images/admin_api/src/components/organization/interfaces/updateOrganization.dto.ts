import { IsBoolean, IsEnum, IsNumber, IsString, ValidateIf } from "class-validator";
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
	public mqttAccessControl: string;

	@IsBoolean()
	public llmEnabled: boolean;

	@IsString()
	@ValidateIf((obj) => obj.llmEnabled === true)
	public llmProviderUrl: string;

	@IsBoolean()
	public changeLlmProviderApiKey: boolean;

	@ValidateIf((obj) => obj.llmEnabled === true && obj.changeLlmProviderApiKey === true)
	@IsString()
	public llmProviderApiKey: string;

	@IsBoolean()
	public telegramEnabled: boolean;

	@IsBoolean()
	@ValidateIf((obj) => obj.telegramEnabled === true)
	public changeTelegramSettings?: boolean;

	@IsString()
	@ValidateIf((obj) => obj.telegramEnabled === true && obj.changeTelegramSettings === true)
	public telegramBotToken?: string;
}

export default UpdateOrganizationDto;
