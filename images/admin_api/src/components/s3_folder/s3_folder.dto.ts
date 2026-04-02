import { IsString } from "class-validator";

class CreateS3FolderDto {
	@IsString()
	public folderName: string;

	@IsString()
	public parquetSchema: string;
}

export default CreateS3FolderDto;
