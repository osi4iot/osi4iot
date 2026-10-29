import { IsString, IsNumber, IsOptional } from "class-validator";

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

	// field of the messages to show (one of the measurements of the sensor); by default its first measurement
	@IsOptional()
	@IsString()
	public payloadKey?: string;
}

export default SensorMeasurementsWithPaginationDto;