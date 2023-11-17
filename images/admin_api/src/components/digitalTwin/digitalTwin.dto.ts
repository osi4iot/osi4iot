import { IsNumber, IsString } from "class-validator";


class CreateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public maxNumResFemFiles: number;

	@IsString()
	public dtRefFileName: string;

	@IsString()
	public dtRefFileLastModifDate: string;

	@IsString()
	public digitalTwinSimulationFormat: string;

	@IsString({ each: true })
	public sensorsRef: string[];
}

export default CreateDigitalTwinDto;