import { IsString } from "class-validator";

class CreateNodeWireDto {
	@IsString()
	public wireUid: string;

	@IsString()
	public nodeUid: string;
}

export default CreateNodeWireDto;