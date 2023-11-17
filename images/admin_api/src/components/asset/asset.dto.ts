import { Type } from "class-transformer";
import { IsNumber, IsString, ValidateNested } from "class-validator";
import CreateAssetTopicsRefDto from "./createAssetTopicsRef.dto";
import CreateAssetSensorsRefDto from "./createAssetSensorsRef.dto";

class CreateAssetDto {
	@IsNumber()
	public assetTypeId: number;

	@IsString()
	public description: string;

	@IsNumber()
	public iconRadio: number;

	@IsNumber()
	public iconSizeFactor: number

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;

	@ValidateNested({ each: true })
	@Type(() => CreateAssetTopicsRefDto)
	public topicsRef: CreateAssetTopicsRefDto[];

	@ValidateNested({ each: true })
	@Type(() => CreateAssetSensorsRefDto)
	public sensorsRef: CreateAssetSensorsRefDto[];

}

export default CreateAssetDto;