import { IsString } from "class-validator";

class CreateMLModelDto {
	@IsString()
	public mlModelUid: string;

	@IsString()
	public description: string;

	@IsString()
	public mlLibrary: string;
}

export default CreateMLModelDto;