import { IsNumber, IsString, IsEmail, Matches, IsOptional } from "class-validator";
import { IsTimeZone } from "../../../utils/validators/isTimeZone";

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
	@Matches(/^[a-zA-Z0-9._-]{4,}$/)
	public login: string;

	// Default time zone (IANA name; "": the browser's): the AI agents write
	// their times in it.
	@IsOptional()
	@IsTimeZone()
	public timezone?: string;
}

export default UserProfileDto;