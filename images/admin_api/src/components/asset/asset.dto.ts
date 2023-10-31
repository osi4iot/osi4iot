import { IsNumber, IsString } from "class-validator";

class CreateAssetDto {
	@IsNumber()
	public assetTypeId: number;

	@IsString()
	public description: string;

	@IsNumber()
	public iconRadio: number;

	@IsNumber()
	public iconImageFactor: number

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;
}

export default CreateAssetDto;