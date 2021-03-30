import { IsString } from "class-validator";

class RefreshTokenToDisableDto {
  @IsString()
  public refreshTokenToDisable: string;
}

export default RefreshTokenToDisableDto;
