import { IsString } from "class-validator";

class CreateDigitalTwinDto {
	@IsString()
	public digitalTwinUid: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsString()
	public gltfData: string;

	@IsString()
	public gltfFileName: string;

	@IsString()
	public gltfFileLastModifDateString: string;

	@IsString()
	public femSimulationData: string;

	@IsString()
	public femSimDataFileName: string;

	@IsString()
	public femSimDataFileLastModifDateString: string;

	@IsString()
	public digitalTwinSimulationFormat: string;
}

export default CreateDigitalTwinDto;