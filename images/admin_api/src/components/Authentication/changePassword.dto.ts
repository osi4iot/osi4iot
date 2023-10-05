import { IsString, Matches } from "class-validator";

class CreateChangePasswordDto {
	@IsString()
	public oldPassword: string;

	@IsString()
	@Matches(/^[a-zA-Z0-9._-]*$/g)
	public newPassword: string;
}

export default CreateChangePasswordDto;
