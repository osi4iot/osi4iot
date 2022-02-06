import { IsString, IsNumber, ValidateIf } from "class-validator";

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

	@IsString()
	public digitalTwinSimulationFormat: string;

	@ValidateIf((obj) => obj.sensorSimulationTopicId !== undefined)
	@IsNumber()
	public sensorSimulationTopicId?: number;

	@ValidateIf((obj) => obj.assetStateTopicId !== undefined)
	@IsNumber()
	public assetStateTopicId?: number;

	@ValidateIf((obj) => obj.assetStateSimulationTopicId !== undefined)
	@IsNumber()
	public assetStateSimulationTopicId?: number;

	@ValidateIf((obj) => obj.femResultModalValuesTopicId !== undefined)
	@IsNumber()
	public femResultModalValuesTopicId?: number;

	@ValidateIf((obj) => obj.femResultModalValuesSimulationTopicId !== undefined)
	@IsNumber()
	public femResultModalValuesSimulationTopicId?: number;
}

export default CreateDigitalTwinDto;