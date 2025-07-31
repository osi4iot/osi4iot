import { IsArray, IsNumber, IsString, ValidateIf, ValidateNested } from "class-validator";

import { Type } from "class-transformer";
import NodeWireDto from "./nodeWire.dto";

class PipelineNodeDto {
	@IsString()
	public name: string;

	@IsString()
	public nodeUid: string;

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
	@Type(() => NodeWireDto)
	public wires: NodeWireDto[][];
}

export default PipelineNodeDto;
