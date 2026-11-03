import { IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

// What pipelines sends when a user sends "/link <code>" to its organization's bot
class TelegramLinkDto {
	@IsString()
	@Matches(/^[A-Za-z0-9]{4,16}$/)
	public code: string;

	@IsInt()
	@Min(1)
	public telegramUserId: number;

	@IsOptional()
	@IsString()
	public telegramUsername?: string;
}

export default TelegramLinkDto;
