import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { FolderPermissionOptions, FolderPermissionOption } from "./FolerPermissionsOptions";
import CreateGroupAdminDto from "./groupAdmin.dto";
import { IsTimeZone } from "../../../utils/validators/isTimeZone";

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

	@IsBoolean()
	public llmEnabled: boolean;

	@IsBoolean()
	public gpuUsageEnabled: boolean;

	// Knowledge base (RAG) of its groups: off unless enabled.
	@IsOptional()
	@IsBoolean()
	public ragEnabled?: boolean;

	// IANA time zone of the group ("": not set, UTC): the AI agents' times
	// when the user's own is not known.
	@IsOptional()
	@IsTimeZone()
	public timezone?: string;

	@ValidateNested({ each: true })
	@Type(() => CreateGroupAdminDto)
	public groupAdminDataArray: CreateGroupAdminDto[];
}

export default CreateGroupDto;