import { IsNumber, IsString } from "class-validator";

class CreateNodeRedInstanceDto {
	@IsString()
	public nriHash: string;

	@IsNumber()
	public orgId: number;

	groupId?: number;

	longitude?: number;

	latitude?: number;

	iconRadio?: number;
}

export default CreateNodeRedInstanceDto;