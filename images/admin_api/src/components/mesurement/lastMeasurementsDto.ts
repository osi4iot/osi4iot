import { IsNumber, IsString } from "class-validator";

class LastMeasurementsDto {
	@IsString()
	public topic: string;

	@IsNumber()
	public count: number;
}

export default LastMeasurementsDto;