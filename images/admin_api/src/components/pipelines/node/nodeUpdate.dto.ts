import { IsNumber, IsString, ValidateIf } from "class-validator";

class UpdateNodeDto {
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

	@ValidateIf((obj) => obj.debug !== undefined)
	@IsString()
	public debug?: string;
}

export default UpdateNodeDto;
