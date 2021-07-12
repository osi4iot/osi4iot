import { IsString, IsNumber } from "class-validator";

class MeasurementsWithPaginationDto {
	@IsString()
	public topic: string;

	@IsString()
	public startDate: string;

	@IsString()
	public endDate: string;

	@IsNumber()
	public pageIndex: number;

	@IsNumber()
	public itemsPerPage: number;
}

export default MeasurementsWithPaginationDto;