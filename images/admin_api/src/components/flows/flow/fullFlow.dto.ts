import { Type } from "class-transformer";
import { IsNumber, IsString, ValidateNested } from "class-validator";
import CreateFlowNodeDto from "./flowNode.dto";

class CreateFullFlowDto {
	@IsNumber()
	public digitalTwinId: number;

	@IsString()
	public name: string;

	@ValidateNested({ each: true })
	@Type(() => CreateFlowNodeDto)
	public nodes: CreateFlowNodeDto[];
}

export default CreateFullFlowDto;
