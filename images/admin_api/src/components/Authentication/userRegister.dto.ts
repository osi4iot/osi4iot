import { IsString, IsEmail } from "class-validator";

class UserRegisterDto {
	userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsString()
	public login: string;

	@IsEmail()
	public email: string;

	@IsString()
	public telegramId: string;

	@IsString()
	public password: string;
}

export default UserRegisterDto;
