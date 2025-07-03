import { ValidateNested } from "class-validator";
import CreatePipelineNodeDto from "./pipelineNode.dto";
import { Type } from "class-transformer";

class CreatePipelineDto {
	@ValidateNested({ each: true })
	@Type(() => CreatePipelineNodeDto)
	public nodes: CreatePipelineNodeDto[];
}

export default CreatePipelineDto;
