import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { FolderPermissionOptions, FolderPermissionOption } from "./FolerPermissionsOptions";
import { IsTimeZone } from "../../../utils/validators/isTimeZone";

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

	@IsBoolean()
	public llmEnabled: boolean;

	@IsBoolean()
	public gpuUsageEnabled: boolean;

	// Knowledge base (RAG) of its groups: off unless enabled.
	@IsOptional()
	@IsBoolean()
	public ragEnabled?: boolean;

	// Files attached to the chat (photos of the phone, Telegram...) may be sent to the organization's LLM
	// provider: off unless enabled (photos of people or internal documents may have to stay in the platform).
	@IsOptional()
	@IsBoolean()
	public chatAttachmentsEnabled?: boolean;

	// IANA time zone of the group ("": not set, UTC): the AI agents' times
	// when the user's own is not known.
	@IsOptional()
	@IsTimeZone()
	public timezone?: string;
}

export default UpdateGroupDto;