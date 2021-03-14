import { IsEmail, IsNumber, IsString, ValidateIf } from "class-validator";

class UserInOrgToUpdateDto {
	@IsString()
	public name: string;

	@IsEmail()
	public email: string;

	@IsString()
	public login: string;

	@IsString()
	public telegramId: string;

	@IsString()
	public roleInOrg: string;
}

export default UserInOrgToUpdateDto;