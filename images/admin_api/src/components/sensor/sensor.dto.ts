import { IsNumber, IsOptional, IsString } from "class-validator";

class CreateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	sensorType: string;

	@IsNumber()
	public sensorTypeId: number;

	@IsString()
	public sensorRef: string;

	// Fields it measures, with label and units (see utils/measurements.ts)
	@IsOptional()
	@IsString()
	public measurements?: string;

	// Obsoleto (versiones anteriores, mismo contenido como JSON schema): se convierte a measurements
	@IsOptional()
	@IsString()
	public payloadJsonSchema?: string;
}

export default CreateSensorDto;