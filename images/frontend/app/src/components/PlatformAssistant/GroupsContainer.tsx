import React, { FC, useCallback, useState } from 'react'
import TableWithPagination from './TableWithPagination';
import { GROUPS_OPTIONS } from './platformAssistantOptions';
import CreateGroup from './CreateGroup';
import EditGroup from './EditGroup';
import { useGroupsDispatch, useGroupsOptionToShow, setGroupsOptionToShow } from '../../contexts/groupsOptions';
import { IGroup, Create_GROUPS_COLUMNS } from './TableColumns/groupsColumns';

export interface IGroupAdminData {
    firstName: string;
    surname: string;
    email: string;
}


export interface IGroupInputData {
    orgId: number;
    name: string;
    acronym: string;
    folderPermission: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    floorNumber: number;
    geoJsonData: string;
    groupAdminDataArray: IGroupAdminData[];
}


const initialGroupData = {
    orgId: 1,
    name: "",
    acronym: "",
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
    floorNumber: 0,
    geoJsonData: "{}",
    groupAdminDataArray: [
        {
            firstName: "",
            surname: "",
            email: "",
        }
    ]
}

interface GroupsContainerProps {
    groups: IGroup[];
    refreshGroups: () => void;
}

const GroupsContainer: FC<GroupsContainerProps> = ({ groups, refreshGroups }) => {
    const groupsDispatch = useGroupsDispatch();
    const groupsOptionToShow = useGroupsOptionToShow();
    const [groupInputData, setGroupInputData] = useState<IGroupInputData>(initialGroupData)

    const showGroupsTableOption = useCallback(() => {
        setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.TABLE });
    }, [groupsDispatch])

    return (
        <>

            {groupsOptionToShow === GROUPS_OPTIONS.CREATE_GROUP &&
                <CreateGroup
                    backToTable={showGroupsTableOption}
                    refreshGroups={refreshGroups}
                    groupInputData={groupInputData}
                    setGroupInputData={(groupInputData: IGroupInputData) => setGroupInputData(groupInputData)}
                />
            }
            {groupsOptionToShow === GROUPS_OPTIONS.EDIT_GROUP && <EditGroup groups={groups} backToTable={showGroupsTableOption} refreshGroups={refreshGroups} />}
            {groupsOptionToShow === GROUPS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groups}
                    columnsTable={Create_GROUPS_COLUMNS(refreshGroups)}
                    componentName="group"
                    reloadTable={refreshGroups}
                    createComponent={() => setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.CREATE_GROUP })}
                />
            }

        </>
    )
}

export default GroupsContainer;
