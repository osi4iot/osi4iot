import { Type } from "class-transformer";
import { IsEnum, IsString } from "class-validator";
import { FolderPermissionOptions, FolderPermissionOption } from "./FolerPermissionsOptions";

class UpdateGroupDto {
	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsString()
	public telegramInvitationLink?: string;

	@IsString()
	public telegramChatId?: string;

	@IsEnum(FolderPermissionOptions, {message: " 'Editor' or 'Viewer' are the only valid options for folderPermission."})
	public folderPermission: FolderPermissionOption;
}

export default UpdateGroupDto;