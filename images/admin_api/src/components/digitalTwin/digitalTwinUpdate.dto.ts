import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

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

	@IsString()
	public digitalTwinSimulationFormat: string;

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
