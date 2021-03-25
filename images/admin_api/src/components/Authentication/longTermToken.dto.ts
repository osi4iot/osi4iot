import { IsNumber, IsString } from "class-validator";

class CreateLongTermTokenDto {
	@IsString()
	public emailOrLogin: string;

	@IsString()
	public password: string;

	@IsNumber()
	public tokenLifeTime: number;
}

export default CreateLongTermTokenDto;