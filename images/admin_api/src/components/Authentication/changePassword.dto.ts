import { IsString } from "class-validator";

class CreateChangePasswordDto {
	@IsString()
	public oldPassword: string;

	@IsString()
	public newPassword: string;
}

export default CreateChangePasswordDto;
