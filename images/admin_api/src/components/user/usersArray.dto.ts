import { Type } from "class-transformer";
import { ValidateNested, Allow } from "class-validator";
import CreateUserDto from "./User.dto";

class CreateUsersArrayDto {
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  public users: CreateUserDto[];
}

export default CreateUsersArrayDto;