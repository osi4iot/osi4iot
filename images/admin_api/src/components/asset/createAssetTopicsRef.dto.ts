import { IsBoolean, IsOptional, IsString } from "class-validator";


class CreateAssetTopicsRefDto {
	@IsString()
	public topicRef: string;

	@IsString()
	public topicType: string;

	@IsString()
	public description: string;

	// JSON schema of its messages (JSON string). Only used for the types written by the user (dev2dtm, dtm2dev,
	// dtm2pdb, inject_N...): the platform computes the others (see topic/messageSchema.ts)
	@IsOptional()
	@IsString()
	public messageSchema?: string;

	// Obsoleto (versiones anteriores): se usa como messageSchema
	@IsOptional()
	@IsString()
	public payloadJsonSchema?: string;

	@IsString()
	public mqttAccessControl: string;

	// Obsoletos (las columnas del tópico ya no existen): se aceptan para no rechazar archivos y clientes
	// antiguos, pero se ignoran
	@IsOptional()
	@IsBoolean()
	public requireS3Storage?: boolean;

	@IsOptional()
	@IsString()
	public s3Folder?: string;

	@IsOptional()
	@IsString()
	public parquetSchema?: string;
}

export default CreateAssetTopicsRefDto;