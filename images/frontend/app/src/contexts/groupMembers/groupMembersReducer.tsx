import { GroupMembersContextProps, GroupMembersAction } from "./interfaces";
import {
    GROUP_MEMBERS_OPTIONS,
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.TABLE,
    groupMemberGroupIdToEdit: 0,
    groupMemberUserIdToEdit: 0,
    groupMemberRowIndexToEdit: 0
};

export const GroupMembersReducer = (initialState: GroupMembersContextProps, action: GroupMembersAction) => {
    switch (action.type) {
        case "GROUP_MEMBERS_OPTION_TO_SHOW":
            return {
                ...initialState,
                groupMembersOptionToShow: action.payload.groupMembersOptionToShow
            };

        case "GROUP_MEMBER_GROUP_ID_TO_EDIT":
            return {
                ...initialState,
                groupMemberGroupIdToEdit: action.payload.groupMemberGroupIdToEdit
            };

        case "GROUP_MEMBER_USER_ID_TO_EDIT":
            return {
                ...initialState,
                groupMemberUserIdToEdit: action.payload.groupMemberUserIdToEdit
            };

        case "GROUP_MEMBER_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                groupMemberRowIndexToEdit: action.payload.groupMemberRowIndexToEdit
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};