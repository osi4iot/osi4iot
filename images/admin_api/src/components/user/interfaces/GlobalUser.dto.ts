import { IsString, IsEmail, ValidateIf, IsNumber, IsBoolean } from "class-validator";

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
	public login: string;

	@ValidateIf((obj) => obj.password !== undefined)
	@IsString()
	public password: string;
}

export default CreateGlobalUserDto;