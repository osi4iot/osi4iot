import { IsOptional, IsString, ValidateIf } from "class-validator";

class CreateNodeWireDto {
	@IsString()
	public name: string;

	@IsString()
	public nodeEndName: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.wireUid !== undefined)
	public wireUid?: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.nodeUid !== undefined)
	public nodeUid?: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.nodeEndUid !== undefined)
	public nodeEndUid?: string;
}

export default CreateNodeWireDto;
