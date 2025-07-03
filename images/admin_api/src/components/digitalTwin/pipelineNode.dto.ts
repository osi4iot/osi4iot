
import {
	IsArray,
	IsNumber,
	IsString,
	ValidateIf,
	ValidateNested,
} from "class-validator";
import CreateNodeWireDto from "./nodeWire.dto";
import { Type } from "class-transformer";

class CreatePipelineNodeDto {
	@IsString()
	public nodeUid?: string;

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

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateNodeWireDto)
	public wires: CreateNodeWireDto[][];
}

export default CreatePipelineNodeDto;