import { IsString } from "class-validator";

class CreateSensorTypeDto {
	orgId: number;

	@IsString()
	public type: string;

	@IsString()
	public iconSvgFileName: string;

	@IsString()
	public iconSvgString: string;

	@IsString()
	public markerSvgFileName: string;

	@IsString()
	public markerSvgString: string;

	@IsString()
	public payloadJsonSchema: string;

	isPredefined: boolean;
}

export default CreateSensorTypeDto;