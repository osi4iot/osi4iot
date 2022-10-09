import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsString } from "class-validator";
import { FolderPermissionOptions, FolderPermissionOption } from "./FolerPermissionsOptions";

class UpdateGroupManagedDto {
	@IsEnum(FolderPermissionOptions, { message: " 'Editor' or 'Viewer' are the only valid options for folderPermission." })
	public folderPermission: FolderPermissionOption;

	@IsString()
	public telegramInvitationLink: string;

	@IsString()
	public telegramChatId?: string;

	@IsNumber()
	public nriInGroupId: number;

	@IsNumber()
	public nriInGroupIconLongitude: number;

	@IsNumber()
	nriInGroupIconLatitude: number;

	@IsNumber()
	nriInGroupIconRadio: number;
}

export default UpdateGroupManagedDto;