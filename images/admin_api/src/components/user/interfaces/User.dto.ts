import { IsString, IsEmail, ValidateIf, IsNumber, IsBoolean, Matches } from "class-validator";

class CreateUserDto {
	public id?: number;

	public name?: string;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsEmail()
	public email: string;

	@ValidateIf((obj) => obj.login !== undefined)
	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{4,}$/)
	public login: string;

	@ValidateIf((obj) => obj.password !== undefined)
	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{8,20}$/)
	public password: string;

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