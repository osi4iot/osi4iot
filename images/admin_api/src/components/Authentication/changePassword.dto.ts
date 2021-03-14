import { IsString } from "class-validator";

class CreateChangePasswordDto {
	@IsString()
	public newPassword: string;
}

export default CreateChangePasswordDto;
