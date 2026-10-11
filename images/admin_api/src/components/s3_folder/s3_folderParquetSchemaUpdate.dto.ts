import { IsString } from "class-validator";

class UpdateS3FolderParquetSchemaDto {
	@IsString()
	public parquetSchema: string;
}

export default UpdateS3FolderParquetSchemaDto;
