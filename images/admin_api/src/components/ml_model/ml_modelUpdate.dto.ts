import { IsBoolean, IsString } from "class-validator";

class UpdateMLModelDto {
	@IsString()
	public description: string;

	@IsString()
	public mlLibrary: string;

	@IsBoolean()
	public areMlModelFilesModified: boolean;
}

export default UpdateMLModelDto;