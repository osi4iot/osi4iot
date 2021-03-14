import { IsString, ValidateIf } from "class-validator";

class AddUserToOrgDto {
	@IsString()
	public email: string;

	@ValidateIf((obj) => obj.roleInOrg !== undefined)
	@IsString()
	public roleInOrg: string;
}

export default AddUserToOrgDto;