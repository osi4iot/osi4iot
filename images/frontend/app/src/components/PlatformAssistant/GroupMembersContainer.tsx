import React, { FC, useCallback } from 'react'
import TableWithPagination from './TableWithPagination';
import { GROUP_MEMBERS_OPTIONS } from './platformAssistantOptions';
import EditGroupMember from './EditGroupMember';
import { setGroupMembersOptionToShow, useGroupMembersDispatch, useGroupMembersOptionToShow } from '../../contexts/groupMembersOptions';
import { Create_GROUP_MEMBERS_COLUMNS, IGroupMember } from './TableColumns/groupMemberColumns';

interface GroupMembersContainerProps {
    groupMembers: IGroupMember[];
    refreshGroupMembers: () => void;
}

const GroupMembersContainer: FC<GroupMembersContainerProps> = ({ groupMembers, refreshGroupMembers }) => {
    const groupMembersDispatch = useGroupMembersDispatch();
    const groupMembersOptionToShow = useGroupMembersOptionToShow();

    const showGroupMemberTableOption = useCallback(() => {
        setGroupMembersOptionToShow(groupMembersDispatch, { groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.TABLE });
    }, [groupMembersDispatch])

    return (
        <>
            {groupMembersOptionToShow === GROUP_MEMBERS_OPTIONS.EDIT_GROUP_MEMBER &&
                <EditGroupMember
                    groupMembers={groupMembers}
                    refreshGroupMembers={refreshGroupMembers}
                    backToTable={showGroupMemberTableOption}
                />
            }
            {groupMembersOptionToShow === GROUP_MEMBERS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groupMembers}
                    columnsTable={Create_GROUP_MEMBERS_COLUMNS(refreshGroupMembers)}
                    componentName=""
                    reloadTable={refreshGroupMembers}
                />
            }
        </>
    )
}

export default GroupMembersContainer;