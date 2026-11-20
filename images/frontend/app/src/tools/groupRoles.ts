// The roles of a user in the groups (README, "Permissions"): Viewer < Editor < Admin. The administrators of the
// platform and of an organization are Admin of every group they manage. The groups a user administers or edits come
// with its role (groupsManaged: roleInGroup "Admin" or "Editor"); a group the user only views is not there.
export type GroupRole = "Viewer" | "Editor" | "Admin";

interface IGroupWithRole {
    id: number;
    roleInGroup?: string;
}

// the user administers some group (the group admin sections of the administrators: members, knowledge base, ML
// models, S3 storage)
// (while the groups are loading, a group administrator keeps them: they do not blink)
export const isAdminOfSomeGroup = (userRole: string, groupsManaged: IGroupWithRole[]): boolean =>
    userRole === "PlatformAdmin" ||
    userRole === "OrgAdmin" ||
    groupsManaged.length === 0 ||
    groupsManaged.some((g) => g.roleInGroup !== "Editor");
