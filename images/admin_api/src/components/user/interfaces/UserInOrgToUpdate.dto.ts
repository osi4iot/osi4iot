import { IsString } from "class-validator";

class UserInOrgToUpdateDto {
	@IsString()
	public roleInOrg: string;
}

export default UserInOrgToUpdateDto;