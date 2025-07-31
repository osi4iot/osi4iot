import { IsBoolean, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import PipelineNodeDto from "./pipelineNode.dto";

class PipelineDto {
	@IsString()
	public pipelineFileName: string;

	@IsString()
	public pipelineFileLastModifDate: string;

	@ValidateNested({ each: true })
	@Type(() => PipelineNodeDto)
	public nodes: PipelineNodeDto[];

	@IsBoolean()
	@IsOptional()
	@ValidateIf((obj) => obj.reinitialize !== undefined)
	public reinitialize?: boolean;
}

export default PipelineDto;
