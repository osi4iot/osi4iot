import { IsString, IsNumber } from "class-validator";

class SensorMeasurementsWithPaginationDto {
	@IsNumber()
	public sensorId: string;

	@IsString()
	public startDate: string;

	@IsString()
	public endDate: string;

	@IsNumber()
	public pageIndex: number;

	@IsNumber()
	public itemsPerPage: number;
}

export default SensorMeasurementsWithPaginationDto;