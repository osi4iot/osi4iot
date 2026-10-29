import { IsOptional, IsString } from "class-validator";

class CreateAssetSensorsRefDto {
	topicId?: number;

	@IsString()
	public sensorRef: string;

	sensorTypeId?: number;

	@IsString()
	public sensorType: string;

	@IsString()
	public topicRef: string;

	@IsString()
	public description: string;

	// Fields it measures, with label and units (see utils/measurements.ts)
	@IsOptional()
	@IsString()
	public measurements?: string;

	// Obsoleto (versiones anteriores, mismo contenido como JSON schema): se convierte a measurements
	@IsOptional()
	@IsString()
	public payloadJsonSchema?: string;
}

export default CreateAssetSensorsRefDto;
