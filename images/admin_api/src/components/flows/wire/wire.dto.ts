import { IsNumber } from "class-validator";

class CreateWireDto {
	@IsNumber()
	public nodeIniId: number;

	@IsNumber()
	public niniOutputIndex: number;

	@IsNumber()
	public nodeEndId: number;
}

export default CreateWireDto;
