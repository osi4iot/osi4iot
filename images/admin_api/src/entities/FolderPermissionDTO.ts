import ITeamFolderPermission from "./TeamFolderPermission";
import IRoleFolderPermission from "./TeamFolderPermission";
import IUserFolderPermission from "./UserFolderPermission";

export default interface IFolderPermissionDTO {
    items: (IRoleFolderPermission | ITeamFolderPermission | IUserFolderPermission)[];
}