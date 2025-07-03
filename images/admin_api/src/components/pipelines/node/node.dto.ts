import { IsNumber, IsString, ValidateIf } from "class-validator";

class CreateNodeDto {
	@ValidateIf((obj) => obj.nodeUid !== undefined)
	@IsString()
	public nodeUid?: string;

	@IsNumber()
	public digitalTwinId: number;

	@IsString()
	public name: string;

	@ValidateIf((obj) => obj.x !== undefined)
	@IsNumber()
	public x: number;

	@ValidateIf((obj) => obj.y !== undefined)
	@IsNumber()
	public y: number;

	@IsNumber()
	public numOutputs: number;

	@IsString()
	public type: string;

	@IsString()
	public settings: string;
}

export default CreateNodeDto;
