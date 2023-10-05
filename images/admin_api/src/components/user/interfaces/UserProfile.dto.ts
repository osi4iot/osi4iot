import { IsNumber, IsString, IsEmail, Matches } from "class-validator";

class UserProfileDto {
	id?: number;

	name?: string;

	@IsNumber()
	public userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsEmail()
	public email: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]*$/g)
	public login: string;
}

export default UserProfileDto;