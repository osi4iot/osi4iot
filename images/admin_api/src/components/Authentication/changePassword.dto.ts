import { IsString, Matches } from "class-validator";

class CreateChangePasswordDto {
	@IsString()
	public oldPassword: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]{8,20}$/)
	public newPassword: string;
}

export default CreateChangePasswordDto;
