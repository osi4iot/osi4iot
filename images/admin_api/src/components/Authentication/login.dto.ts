import { IsString, IsEmail } from "class-validator";

class CreateLoginDto {
  @IsString()
  public emailOrLogin: string;

  @IsString()
  public password: string;
}

export default CreateLoginDto;
