import { IsString, IsEmail, ValidateIf, IsNumber } from "class-validator";
import { RoleInGroupOption } from "./RoleInGroupOptions";

class CreateGroupAdminDto {
	public userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsEmail()
	public email: string;

	public roleInGroup?: RoleInGroupOption;
}

export default CreateGroupAdminDto;