import { IsString } from "class-validator";


class CreatePipelineActionDto {
	@IsString()
	public action: string; // start, stop and restart
}

export default CreatePipelineActionDto;
