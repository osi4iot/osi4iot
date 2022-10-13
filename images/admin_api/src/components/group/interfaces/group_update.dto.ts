import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsString } from "class-validator";
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

	@IsEnum(FolderPermissionOptions, { message: " 'Editor' or 'Viewer' are the only valid options for folderPermission." })
	public folderPermission: FolderPermissionOption;

	@IsNumber()
	public floorNumber: number;

	@IsNumber()
	public featureIndex: number;

	@IsString()
	public mqttAccessControl: string;
}

export default UpdateGroupDto;