import { IsNumber, IsString, ValidateIf, ValidateNested } from "class-validator";

class CreateFlowNodeDto {
	@IsString()
	public nodeUid: string;

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
	public metadata: string;

	@ValidateNested()
	public wires: string[][];
}

export default CreateFlowNodeDto;
