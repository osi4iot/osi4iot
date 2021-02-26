import { IsString } from "class-validator";

class CreateOrganizationDto {
  @IsString()
  public name: string;

  @IsString()
  public acronym: string;

  @IsString()
  public geometry: string;
}

export default CreateOrganizationDto;
