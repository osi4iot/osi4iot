import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { GROUP_MEMBERS_OPTIONS } from './platformAssistantOptions';
import CreateGroupMember from './CreateGroupMember';
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

    return (
        <>
            {groupMembersOptionToShow === GROUP_MEMBERS_OPTIONS.CREATE_GROUP_MEMBER && <CreateGroupMember refreshGroupMembers={refreshGroupMembers} />}
            {groupMembersOptionToShow === GROUP_MEMBERS_OPTIONS.EDIT_GROUP_MEMBER &&
                <EditGroupMember
                    groupMembers={groupMembers}
                    refreshGroupMembers={refreshGroupMembers}
                />
            }
            {groupMembersOptionToShow === GROUP_MEMBERS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groupMembers}
                    columnsTable={Create_GROUP_MEMBERS_COLUMNS(refreshGroupMembers)}
                    componentName="group member"
                    reloadTable={refreshGroupMembers}
                    createComponent={() => setGroupMembersOptionToShow(groupMembersDispatch, { groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.CREATE_GROUP_MEMBER })}
                />
            }
        </>
    )
}

export default GroupMembersContainer;