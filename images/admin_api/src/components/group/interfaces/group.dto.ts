import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsNumber, IsString, ValidateIf, ValidateNested } from "class-validator";
import { FolderPermissionOptions, FolderPermissionOption } from "./FolerPermissionsOptions";
import CreateGroupAdminDto from "./groupAdmin.dto";

class CreateGroupDto {
	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	public email: string;

	@IsString()
	public telegramInvitationLink?: string;

	@IsString()
	public telegramChatId?: string;

	public isOrgDefaultGroup?: boolean;

	@IsEnum(FolderPermissionOptions, { message: " 'Editor' or 'Viewer' are the only valid options for folderPermission." })
	public folderPermission: FolderPermissionOption;

	@IsString()
	public geoJsonData: string;

	@IsNumber()
	public floorNumber: number;

	@ValidateNested({ each: true })
	@Type(() => CreateGroupAdminDto)
	public groupAdminDataArray: CreateGroupAdminDto[];
}

export default CreateGroupDto;