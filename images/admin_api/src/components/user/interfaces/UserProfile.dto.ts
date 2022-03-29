import { IsNumber, IsString, IsEmail } from "class-validator";

class UserProfileDto {
	id?: number;

	name?: string;

	@IsNumber()
	userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsEmail()
	public email: string;

	@IsString()
	public login: string;
}

export default UserProfileDto;