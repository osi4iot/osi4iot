import { IsEmail, IsNumber, IsString, ValidateIf } from "class-validator";

class CreateGroupDto {
	@IsString()
	public name: string;

	@IsString()
	public acronym: string;

	@IsEmail()
	public email: string;

	@ValidateIf((obj) => obj.telegramInvitationLink !== undefined)
	@IsString()
	public telegramInvitationLink?: string;

	@ValidateIf((obj) => obj.telegramChatId !== undefined)
	@IsString()
	public telegramChatId?: string;

	@ValidateIf((obj) => obj.isPrivate !== undefined)
	@IsString()
	public isPrivate?: boolean;
}

export default CreateGroupDto;