import { IsArray, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";
import CreateNodeWireDto from "./nodeWire.dto";
import { Type } from "class-transformer";

class CreatePipelineNodeDto {
	@IsString()
	public name: string;

	@IsOptional()
	@IsString()
	@ValidateIf((obj) => obj.nodeUid !== undefined)
	public nodeUid?: string;

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

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateNodeWireDto)
	public wires: CreateNodeWireDto[][];
}

export default CreatePipelineNodeDto;
