import React, { FC, useState } from 'react'
import TableWithPagination from './TableWithPagination';
import { GROUPS_MANAGED_OPTIONS } from './platformAssistantOptions';
import { useGroupsManagedDispatch, useGroupsManagedOptionToShow, setGroupsManagedOptionToShow } from '../../contexts/groupsManagedOptions';
import CreateGroupMember from './CreateGroupMember';
import { IGroupManaged, GROUPS_MANAGED_COLUMNS } from './TableColumns/groupsManagedColumns';


export interface IGroupMemberInput {
    firstName: string;
    surname: string;
    email: string;
    roleInGroup: string;
}

export interface IGroupMembersInput {
    members: IGroupMemberInput[];
}

const initialGroupsMembersData = {
    members: [
        {
            firstName: "",
            surname: "",
            email: "",
            roleInGroup: "Viewer"
        }
    ]
}

interface GroupsManagedContainerProps {
    groupsManaged: IGroupManaged[];
    refreshGroupsManaged: () => void;
    refreshGroupMembers: () => void;
}

const GroupsManagedContainer: FC<GroupsManagedContainerProps> = ({ groupsManaged, refreshGroupsManaged, refreshGroupMembers }) => {
    const groupsManagedDispatch = useGroupsManagedDispatch();
    const groupsManagedOptionToShow = useGroupsManagedOptionToShow();
    const [groupMembersInputData, setGroupMembersInputData] = useState<IGroupMembersInput>(initialGroupsMembersData)

    const showGroupsManagedTableOption = () => {
        setGroupsManagedOptionToShow(groupsManagedDispatch, { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE });
    }

    return (
        <>
            {groupsManagedOptionToShow === GROUPS_MANAGED_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groupsManaged}
                    columnsTable={GROUPS_MANAGED_COLUMNS}
                    reloadTable={refreshGroupsManaged}
                    componentName=""
                />
            }
            {groupsManagedOptionToShow === GROUPS_MANAGED_OPTIONS.CREATE_GROUP_MEMBERS &&
                <CreateGroupMember
                    refreshGroupMembers={refreshGroupMembers}
                    backToTable={showGroupsManagedTableOption}
                    groupMembersInputData={groupMembersInputData}
                    setGroupMembersInputData={setGroupMembersInputData}
                />
            }
        </>
    )
}

export default GroupsManagedContainer;