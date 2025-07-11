import { IsNumber, IsString, ValidateIf } from "class-validator";

class CreateWireDto {
	@ValidateIf((obj) => obj.wireUid !== undefined)
	@IsString()
	public wireUid?: string;

	@IsNumber()
	public digitalTwinId: number;

	@IsNumber()
	public nodeIniId: number;

	@IsNumber()
	public niniOutputIndex: number;

	@IsNumber()
	public nodeEndId: number;
}

export default CreateWireDto;
