import { IsNumber } from "class-validator";

class RecoverNodeRedInstanceDto {
	@IsNumber({},{each: true})
	public nriIdArray: number[];
}

export default RecoverNodeRedInstanceDto;