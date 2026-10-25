import { IsNotEmpty, IsString, Matches } from "class-validator";

class CreateSensorTypeDto {
	orgId: number;

	@IsString()
	public type: string;

	@IsString()
	public iconSvgFileName: string;

	// Required: it is how the sensor is drawn around its asset.
	@IsString()
	@IsNotEmpty({ message: "The icon svg file of the sensor type is required" })
	@Matches(/<svg[\s>]/i, { message: "The icon of the sensor type must be an svg file" })
	public iconSvgString: string;

	@IsString()
	public dashboardRefreshString: string;

	@IsString()
	public dashboardTimeWindow: string;

	@IsString()
	public defaultPayloadJsonSchema: string;

	isPredefined: boolean;
}

export default CreateSensorTypeDto;