import { IsString } from "class-validator";

class UpdateFlowDto {
	@IsString()
	public name: string;
}

export default UpdateFlowDto;
