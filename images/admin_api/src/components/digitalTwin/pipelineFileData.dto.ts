import {IsString } from "class-validator";

class PipelineFileDataDto {
	@IsString()
	public pipelineFileName: string;

	@IsString()
	public pipelineFileLastModifDate: string;

	@IsString()
	public pipelineFileData: string;
}

export default PipelineFileDataDto;
