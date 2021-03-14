import { IsString, IsEmail, ValidateIf, IsNumber, IsBoolean } from "class-validator";

class CreateUserDto {
	@IsString()
	public name: string;

	@IsEmail()
	public email: string;

	@IsString()
	public login: string;

	@IsString()
	public password: string;

	@ValidateIf((obj) => obj.telegramId !== undefined)
	@IsString()
	public telegramId?: string;

	@ValidateIf((obj) => obj.isGrafanaAdmin !== undefined)
	@IsBoolean()
	public isGrafanaAdmin?: boolean;

	@ValidateIf((obj) => obj.OrgId !== undefined)
	@IsNumber()
	public OrgId?: number;

	@ValidateIf((obj) => obj.roleInOrg !== undefined)
	@IsString()
	public roleInOrg?: string;
}

export default CreateUserDto;