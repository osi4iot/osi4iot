import { IsString } from "class-validator";

class CreateAssetTypeDto {
	orgId: number;

	@IsString()
	public type: string;

	@IsString()
	public iconSvgFileName: string;

	@IsString()
	public iconSvgString: string;

	@IsString()
	public geolocationMode: string;

	@IsString()
	public markerSvgFileName: string;

	@IsString()
	public markerSvgString: string;

	@IsString()
	public assetStateFormat: string;

	isPredefined: boolean;
}

export default CreateAssetTypeDto;