import { IsNumber, IsOptional, IsString } from "class-validator";

class UpdateSensorDto {
	@IsNumber()
	public topicId: number;

	@IsString()
	public description: string;

	@IsNumber()
	public sensorTypeId: number;

	// Fields it measures, with label and units (see utils/measurements.ts)
	@IsOptional()
	@IsString()
	public measurements?: string;

	// Obsoleto (versiones anteriores, mismo contenido como JSON schema): se convierte a measurements
	@IsOptional()
	@IsString()
	public payloadJsonSchema?: string;
}

export default UpdateSensorDto;