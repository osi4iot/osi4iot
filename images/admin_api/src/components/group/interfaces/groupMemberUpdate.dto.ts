import { IsString, IsEmail, ValidateIf, IsNumber, IsEnum } from "class-validator";
import { RoleInGroupOption, RoleInGroupOptions } from "./RoleInGroupOptions";

class UpdateGroupMemberDto {
	@IsEnum(RoleInGroupOptions, {message: " 'Editor', 'Viewer' or 'Admin' are the only valid options for folderPermission."})
	public roleInGroup: RoleInGroupOption;
}

export default UpdateGroupMemberDto