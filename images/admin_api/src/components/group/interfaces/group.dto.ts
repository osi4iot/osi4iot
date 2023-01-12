import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsString, ValidateNested } from "class-validator";
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

	public outerBounds?: number[][];

	@IsNumber()
	public floorNumber: number;

	@IsNumber()
	public featureIndex: number;

	@IsString()
	public mqttAccessControl: string;

	@ValidateNested({ each: true })
	@Type(() => CreateGroupAdminDto)
	public groupAdminDataArray: CreateGroupAdminDto[];
}

export default CreateGroupDto;