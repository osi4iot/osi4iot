import { IsString, IsEmail } from "class-validator";

class LoginDto {
	@IsString()
	public emailOrLogin: string;

	@IsString()
	public password: string;
}

export default LoginDto;
