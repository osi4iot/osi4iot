import { IsString } from "class-validator";

class CreateMLModelDto {
	@IsString()
	public mlModelUid: string;

	@IsString()
	public description: string;
}

export default CreateMLModelDto;