import { IsString, Matches } from "class-validator";

class LoginDto {
	@IsString()
	@Matches(/^[a-zA-Z0-9._-]*$/g)
	public emailOrLogin: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]*$/g)
	public password: string;
}

export default LoginDto;
