import React, { FC, useState, useCallback } from 'react'
import { toast } from 'react-toastify';
import TableWithPagination from '../Utils/TableWithPagination';
import { GROUPS_MANAGED_OPTIONS } from '../Utils/platformAssistantOptions';
import {
    useGroupsManagedDispatch,
    useGroupsManagedOptionToShow,
    setGroupsManagedOptionToShow,
} from '../../../contexts/groupsManagedOptions';
import CreateGroupMember from './CreateGroupMember';
import { IGroupManaged, CREATE_GROUPS_MANAGED_COLUMNS } from '../TableColumns/groupsManagedColumns';
import EditGroupManaged from './EditGroupManaged';
import { IOrgOfGroupsManaged } from '../TableColumns/orgsOfGroupsManagedColumns';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { IAsset } from '../TableColumns/assetsColumns';
import { IAssetType } from '../TableColumns/assetTypesColumns';


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
    orgsOfGroupManaged: IOrgOfGroupsManaged[];
    groupsManaged: IGroupManaged[];
    buildingsFiltered: IBuilding[];
    floorsFiltered: IFloor[];
    refreshGroupsManaged: () => void;
    refreshGroupMembers: () => void;
    assetTypes: IAssetType[];
    assets: IAsset[];
    refreshAssets: () => void;
    refreshGroups: () => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
}

const GroupsManagedContainer: FC<GroupsManagedContainerProps> = ({
    orgsOfGroupManaged,
    groupsManaged,
    buildingsFiltered,
    floorsFiltered,
    refreshGroupsManaged,
    refreshGroupMembers,
    assetTypes,
    assets,
    refreshAssets,
    refreshGroups,
    refreshBuildings,
    refreshFloors,
}) => {
    const groupsManagedDispatch = useGroupsManagedDispatch();
    const groupsManagedOptionToShow = useGroupsManagedOptionToShow();
    const [groupMembersInputData, setGroupMembersInputData] = useState<IGroupMembersInput>(initialGroupsMembersData);

    const showGroupsManagedTableOption = useCallback(() => {
        setGroupsManagedOptionToShow(groupsManagedDispatch, { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE });
    }, [groupsManagedDispatch]);


    const showSelectLocationOption = useCallback(() => {
        if (buildingsFiltered.length !== 0 && floorsFiltered.length !== 0) {
            setGroupsManagedOptionToShow(groupsManagedDispatch, { groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.EDIT_GROUP_MANAGED });
        } else {
            const warningMessage = "To select a location for the building and floor geodata must be already entered"
            toast.warning(warningMessage);
        }
    }, [groupsManagedDispatch, buildingsFiltered.length, floorsFiltered.length]);

    return (
        <>
            {groupsManagedOptionToShow === GROUPS_MANAGED_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groupsManaged}
                    columnsTable={CREATE_GROUPS_MANAGED_COLUMNS(refreshGroupMembers, refreshGroupsManaged)}
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
            {groupsManagedOptionToShow === GROUPS_MANAGED_OPTIONS.EDIT_GROUP_MANAGED &&
                <EditGroupManaged
                    orgsOfGroupManaged={orgsOfGroupManaged}
                    groupsManaged={groupsManaged}
                    backToTable={showGroupsManagedTableOption}
                    refreshGroupsManaged={refreshGroupsManaged}
                    selectLocationOption={showSelectLocationOption}
                />
            }
        </>
    )
}

export default GroupsManagedContainer;