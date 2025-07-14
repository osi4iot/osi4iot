import { IsBoolean, ValidateNested } from "class-validator";
import CreatePipelineNodeDto from "./pipelineNode.dto";
import { Type } from "class-transformer";

export class UpdatePipelineDto {
	@ValidateNested({ each: true })
	@Type(() => CreatePipelineNodeDto)
	public nodes: CreatePipelineNodeDto[];

	@IsBoolean()
	public reinitialize: boolean;

	// @IsBoolean()
	// public forceUpdate: boolean;
}
