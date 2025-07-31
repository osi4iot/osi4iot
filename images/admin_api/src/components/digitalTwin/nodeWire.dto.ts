import { IsOptional, IsString, ValidateIf } from "class-validator";

class NodeWireDto {
	@IsString()
	public nodeEndUid: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.name !== undefined)
	public name?: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.nodeEndName !== undefined)
	public nodeEndName?: string;


	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.wireUid !== undefined)
	public wireUid?: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.nodeUid !== undefined)
	public nodeUid?: string;
}

export default NodeWireDto;
