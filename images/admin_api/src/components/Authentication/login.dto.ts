import { IsString, Matches } from "class-validator";

class LoginDto {
	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{4,}$/)
	public emailOrLogin: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{8,20}$/)
	public password: string;
}

export default LoginDto;
