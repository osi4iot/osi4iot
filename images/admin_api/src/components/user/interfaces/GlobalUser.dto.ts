import { IsString, IsEmail, ValidateIf, Matches } from "class-validator";

class CreateGlobalUserDto {
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
}

export default CreateGlobalUserDto;