import { Type } from "class-transformer";
import { ValidateNested, Allow } from "class-validator";
import CreateGroupMemberDto from "./groupMember.dto";

class CreateGroupMembersArrayDto {
  @ValidateNested({ each: true })
  @Type(() => CreateGroupMemberDto)
  public members: CreateGroupMemberDto[];
}

export default CreateGroupMembersArrayDto;