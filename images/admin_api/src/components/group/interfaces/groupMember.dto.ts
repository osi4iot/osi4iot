import { IsString, IsEmail, ValidateIf, IsNumber, IsEnum } from "class-validator";
import { RoleInGroupOption, RoleInGroupOptions } from "./RoleInGroupOptions";

class CreateGroupMemberDto {
	public userId?: number;

	@IsString()
	public firstName: string;

	@IsString()
	public surname: string;

	@IsEmail()
	public email: string;

	@IsEnum(RoleInGroupOptions, {message: " 'Editor', 'Viewer' or 'Admin' are the only valid options for folderPermission."})
	public roleInGroup: RoleInGroupOption;
}

export default CreateGroupMemberDto;