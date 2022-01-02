import { IsString, IsNumber } from "class-validator";

class CreateDigitalTwinDto {
	@IsString()
	public name: string;

	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public dashboardId: number;

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
}

export default CreateDigitalTwinDto;