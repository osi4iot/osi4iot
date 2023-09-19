import { IsNumber, IsString } from "class-validator";

class CreateAssetDto {
	@IsString()
	public description: string;

	@IsString()
	public type: string;

	@IsNumber()
	public iconRadio: number;

	@IsNumber()
	public longitude: number;

	@IsNumber()
	public latitude: number;
}

export default CreateAssetDto;