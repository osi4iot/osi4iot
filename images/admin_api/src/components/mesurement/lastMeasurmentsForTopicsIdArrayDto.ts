import { IsNumber } from "class-validator";

class LastMeasurementsForTopicsIdArrayDto {
	@IsNumber({},{each: true})
	public topicsIdArray: number[];
}

export default LastMeasurementsForTopicsIdArrayDto;