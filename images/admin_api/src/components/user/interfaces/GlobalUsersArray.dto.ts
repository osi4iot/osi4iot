import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import CreateGlobalUserDto from "./GlobalUser.dto";

class CreateGlobalUsersArrayDto {
	@ValidateNested({ each: true })
	@Type(() => CreateGlobalUserDto)
	public users: CreateGlobalUserDto[];
}

export default CreateGlobalUsersArrayDto;