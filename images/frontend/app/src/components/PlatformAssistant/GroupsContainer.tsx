import React, { FC } from 'react'
import TableWithPagination from './TableWithPagination';
import { GROUPS_OPTIONS } from './platformAssistantOptions';
import CreateGroup from './CreateGroup';
import EditGroup from './EditGroup';
import { useGroupsDispatch, useGroupsOptionToShow, setGroupsOptionToShow } from '../../contexts/groups';
import { IGroup, Create_GROUPS_COLUMNS } from './TableColumns/groupsColumns';


interface GroupsContainerProps {
    groups: IGroup[];
    refreshGroups: () => void;
}

const GroupsContainer: FC<GroupsContainerProps> = ({ groups, refreshGroups }) => {
    const groupsDispatch = useGroupsDispatch();
    const groupsOptionToShow = useGroupsOptionToShow();

    return (
        <>

            { groupsOptionToShow === GROUPS_OPTIONS.CREATE_GROUP && <CreateGroup refreshGroups={refreshGroups} />}
            { groupsOptionToShow === GROUPS_OPTIONS.EDIT_GROUP && <EditGroup groups={groups} refreshGroups={refreshGroups} />}
            { groupsOptionToShow === GROUPS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groups}
                    columnsTable={Create_GROUPS_COLUMNS(refreshGroups)}
                    componentName="group"
                    createComponent={() => setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.CREATE_GROUP })}
                />
            }

        </>
    )
}

export default GroupsContainer;
