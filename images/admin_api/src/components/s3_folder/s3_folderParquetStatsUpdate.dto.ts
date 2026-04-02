import { IsNumber, IsString } from "class-validator";

class UpdateS3FolderParquetStatsDto {
	@IsNumber()
	public parquetFileCount: number;

	@IsNumber()
	public parquetTotalBytes: number;

	@IsString()
	public lastS3Storage: string;
}

export default UpdateS3FolderParquetStatsDto;
