import React, { FC, useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import TableWithPagination from '../Utils/TableWithPagination';
import { GROUPS_OPTIONS, GROUPS_PREVIOUS_OPTIONS } from '../Utils/platformAssistantOptions';
import CreateGroup from './CreateGroup';
import EditGroup from './EditGroup';
import {
    useGroupsDispatch,
    useGroupsOptionToShow,
    setGroupsOptionToShow,
    useGroupInputData,
    setGroupInputData,
    useGroupsPreviousOption
} from '../../../contexts/groupsOptions';
import { IGroup, Create_GROUPS_COLUMNS } from '../TableColumns/groupsColumns';
import GroupLocationContainer from './GroupLocationContainer';
import { IFloor } from '../TableColumns/floorsColumns';
import { IBuilding } from '../TableColumns/buildingsColumns';
import {
    useOrgsManagedTable,
} from '../../../contexts/platformAssistantContext';
import { IGroupInputData } from '../../../contexts/groupsOptions/interfaces';

const initialCreateGroupInputData = {
    orgId: 1,
    name: "",
    acronym: "",
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
    floorNumber: 0,
    featureIndex: 1,
    mqttAccessControl: "Pub & Sub",
    groupAdminDataArray: [
        {
            firstName: "",
            surname: "",
            email: "",
        }
    ]
}


interface GroupsContainerProps {
    buildingsFiltered: IBuilding[];
    floorsFiltered: IFloor[];
    groups: IGroup[];
    refreshGroups: () => void;
    refreshBuildings: () => void;
    refreshFloors: () => void;
}

const GroupsContainer: FC<GroupsContainerProps> = ({
    buildingsFiltered,
    floorsFiltered,
    groups,
    refreshGroups,
    refreshBuildings,
    refreshFloors
}) => {
    const groupsDispatch = useGroupsDispatch();
    const groupsOptionToShow = useGroupsOptionToShow();
    const orgsManagedTable = useOrgsManagedTable();
    const editGroupInputData = useGroupInputData();
    const previousOption = useGroupsPreviousOption();
    const intialGroupInputData = { ...initialCreateGroupInputData, orgId: orgsManagedTable[0].id }
    const [createGroupInputData, setCreateGroupInputData] = useState<IGroupInputData>(intialGroupInputData);
    const [floorSelected, setFloorSelected] = useState<IFloor | null>(null);

    const setGroupLocationData = useCallback((floorNumber: number, featureIndex: number) => {
        if (previousOption === GROUPS_PREVIOUS_OPTIONS.CREATE_GROUP) {
            const newGroupInputData = { ...createGroupInputData };
            newGroupInputData.floorNumber = floorNumber;
            newGroupInputData.featureIndex = featureIndex;
            setCreateGroupInputData(newGroupInputData);
        }
        else if (previousOption === GROUPS_PREVIOUS_OPTIONS.EDIT_GROUP) {
            const newGroupInputData = { ...editGroupInputData };
            newGroupInputData.floorNumber = floorNumber;
            newGroupInputData.featureIndex = featureIndex;
            const groupInputFormData = { groupInputFormData: newGroupInputData }
            setGroupInputData(groupsDispatch, groupInputFormData);
        }
    }, [createGroupInputData, editGroupInputData, groupsDispatch, previousOption]);

    const showGroupsTableOption = useCallback(() => {
        setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.TABLE });
    }, [groupsDispatch]);


    const backToOption = useCallback(() => {
        if (previousOption === GROUPS_PREVIOUS_OPTIONS.CREATE_GROUP) {
            setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.CREATE_GROUP });
        } else if (previousOption === GROUPS_PREVIOUS_OPTIONS.EDIT_GROUP) {
            setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.EDIT_GROUP });
        }
    }, [groupsDispatch, previousOption]);

    const showSelectSpaceOption = useCallback(() => {
        if (buildingsFiltered.length !== 0 && floorsFiltered.length !== 0) {
            setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.SELECT_SPACE });
        } else {
            const warningMessage = "To select an space for the group, building and floor geodata must be already entered"
            toast.warning(warningMessage);
        }
    }, [groupsDispatch, buildingsFiltered.length, floorsFiltered.length])

    const selectFloor = (floor: IFloor | null) => {
        setFloorSelected(floor);
    }

    return (
        <>

            {groupsOptionToShow === GROUPS_OPTIONS.CREATE_GROUP &&
                <CreateGroup
                    buildings={buildingsFiltered}
                    orgsManagedTable={orgsManagedTable}
                    backToTable={showGroupsTableOption}
                    selectSpaceOption={showSelectSpaceOption}
                    refreshGroups={refreshGroups}
                    groupInputData={createGroupInputData}
                    setGroupInputData={(groupInputData: IGroupInputData) => setCreateGroupInputData(groupInputData)}
                    floorSelected={floorSelected}
                />
            }
            {groupsOptionToShow === GROUPS_OPTIONS.EDIT_GROUP &&
                <EditGroup
                    buildings={buildingsFiltered}
                    groups={groups}
                    orgsManagedTable={orgsManagedTable}
                    selectSpaceOption={showSelectSpaceOption}
                    backToTable={showGroupsTableOption}
                    refreshGroups={refreshGroups}
                />
            }
            {groupsOptionToShow === GROUPS_OPTIONS.TABLE &&
                <TableWithPagination
                    dataTable={groups}
                    columnsTable={Create_GROUPS_COLUMNS(refreshGroups)}
                    componentName="group"
                    reloadTable={refreshGroups}
                    createComponent={() => setGroupsOptionToShow(groupsDispatch, { groupsOptionToShow: GROUPS_OPTIONS.CREATE_GROUP })}
                />
            }
            {groupsOptionToShow === GROUPS_OPTIONS.SELECT_SPACE &&
                <GroupLocationContainer
                    buildings={buildingsFiltered}
                    floors={floorsFiltered}
                    floorSelected={floorSelected}
                    selectFloor={selectFloor}
                    refreshBuildings={refreshBuildings}
                    refreshFloors={refreshFloors}
                    backToOption={backToOption}
                    setGroupLocationData={(floorNumber: number, featureIndex: number) => setGroupLocationData(floorNumber, featureIndex)}
                />
            }
        </>
    )
}

export default GroupsContainer;

