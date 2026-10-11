import { IsBoolean, IsString } from "class-validator";


class CreatePipelineActionDto {
	@IsString()
	public action: string; // start, stop and restart

	@IsBoolean()
	public reinitialize: boolean;
}

export default CreatePipelineActionDto;
