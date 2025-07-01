import { IsNumber, IsString } from "class-validator";

class CreateFlowDto {
	@IsNumber()
	public digitalTwinId: number;

	@IsString()
	public name: string;
}

export default CreateFlowDto;