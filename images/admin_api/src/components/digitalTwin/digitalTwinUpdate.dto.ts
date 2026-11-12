import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from "class-validator";

class UpdateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public maxNumResFemFiles: number;

	@IsBoolean()
	public isGltfFileModified: boolean;

	@IsBoolean()
	public chatAssistantEnabled: boolean;

	@IsString()
	public chatAssistantLanguage: string;

	// Bilingual chat: the second language ("none": not bilingual, "zh-CN", "en-GB"...)
	@IsOptional()
	@IsString()
	@MaxLength(20)
	@Matches(/^(none|[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*)$/)
	public chatAssistantSecondLanguage?: string;

	// The language of the spoken answers: that of the question, the first or the second
	@IsOptional()
	@IsIn(["question", "primary", "secondary"])
	public chatAssistantVoiceLanguage?: string;

	// Chat channels: voice messages of the phone ("Mobile audio" sensor) and a Telegram chat ("": none)
	@IsOptional()
	@IsBoolean()
	public chatMobileVoiceEnabled?: boolean;

	@IsOptional()
	@IsString()
	@Matches(/^(-?\d{1,20})?$/)
	public chatTelegramChatId?: string;

	@IsString()
	public digitalTwinSimulationFormat: string;

	// The file the simulation format was loaded from ("-": none)
	@IsOptional()
	@IsString()
	public digitalTwinSimulationFormatFileName?: string;

	@IsOptional()
	@IsString()
	public digitalTwinSimulationFormatLastModifDate?: string;

	@IsBoolean()
	public pipelineRequiresGpu: boolean;

	@IsString({ each: true })
	public sensorsRef: string[];

	// The knowledge base documents (file names) its AI agents may read:
	// none unless chosen.
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	public knowledgeDocuments?: string[];
}

export default UpdateDigitalTwinDto;
