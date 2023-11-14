import { IsString, IsEmail, Matches } from "class-validator";

class UserRegisterDto {
	userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{4,}$/)
	public login: string;

	@IsEmail()
	public email: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{8,20}$/)
	public password: string;
}

export default UserRegisterDto;
