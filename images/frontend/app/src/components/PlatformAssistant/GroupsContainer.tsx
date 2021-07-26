import React, { FC, useCallback, useEffect, useState } from 'react';
import Loader from "../Tools/Loader";
import { toast } from 'react-toastify';
import TableWithPagination from './TableWithPagination';
import { GROUPS_OPTIONS, GROUPS_PREVIOUS_OPTIONS } from './platformAssistantOptions';
import CreateGroup from './CreateGroup';
import EditGroup from './EditGroup';
import { axiosAuth, getDomainName, axiosInstance } from '../../tools/tools';
import {
    useGroupsDispatch,
    useGroupsOptionToShow,
    setGroupsOptionToShow,
    useGroupInputData,
    setGroupInputData,
    useGroupsPreviousOption
} from '../../contexts/groupsOptions';
import { IGroup, Create_GROUPS_COLUMNS } from './TableColumns/groupsColumns';
import GroupLocationContainer from './GroupLocationContainer';
import { IFloor } from './TableColumns/floorsColumns';
import { IBuilding } from './TableColumns/buildingsColumns';
import {
    useOrgsManagedTable,
    useBuildingsTable,
    useFloorsTable,
    setBuildingsTable,
    setFloorsTable,
    usePlatformAssitantDispatch
} from '../../contexts/platformAssistantContext';
import { useAuthDispatch, useAuthState } from '../../contexts/authContext';
import { filterBuildings } from '../../tools/filterBuildings';
import { filterFloors } from '../../tools/filterFloors';
import { IGroupInputData } from '../../contexts/groupsOptions/interfaces';

const initialCreateGroupInputData = {
    orgId: 1,
    name: "",
    acronym: "",
    folderPermission: "Viewer",
    telegramInvitationLink: "",
    telegramChatId: "",
    floorNumber: 0,
    featureIndex: 0,
    groupAdminDataArray: [
        {
            firstName: "",
            surname: "",
            email: "",
        }
    ]
}


const domainName = getDomainName();

interface GroupsContainerProps {
    groups: IGroup[];
    refreshGroups: () => void;
}

const GroupsContainer: FC<GroupsContainerProps> = ({
    groups,
    refreshGroups
}) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const groupsDispatch = useGroupsDispatch();
    const groupsOptionToShow = useGroupsOptionToShow();
    const orgsManagedTable = useOrgsManagedTable();
    const editGroupInputData = useGroupInputData();
    const previousOption = useGroupsPreviousOption();
    const [createGroupInputData, setCreateGroupInputData] = useState<IGroupInputData>(initialCreateGroupInputData);
    const [reloadBuildings, setReloadBuildings] = useState(false);
    const [reloadFloors, setReloadloors] = useState(false);
    const [buildingsLoading, setBuildingsLoading] = useState(true);
    const [floorsLoading, setFloorsLoading] = useState(true);
    const [buildingsFiltered, setBuildingsFiltered] = useState<IBuilding[]>([]);
    const [floorsFiltered, setFloorsFiltered] = useState<IFloor[]>([]);
    const [floorSelected, setFloorSelected] = useState<IFloor | null>(null);

    useEffect(() => {
        if (buildingsTable.length === 0 || reloadBuildings) {
            const urlBuildings = `https://${domainName}/admin_api/buildings/user_groups_managed/`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlBuildings, config)
                .then((response) => {
                    const buildings = response.data;
                    setBuildingsTable(plaformAssistantDispatch, { buildings });
                    setBuildingsLoading(false);
                    const buildingsFiltered = filterBuildings(buildings);
                    setBuildingsFiltered(buildingsFiltered);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setBuildingsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadBuildings,
        buildingsTable.length
    ]);

    useEffect(() => {
        if (floorsTable.length === 0 || reloadFloors) {
            const urlFloors = `https://${domainName}/admin_api/building_floors/user_groups_managed/`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlFloors, config)
                .then((response) => {
                    const floors = response.data;
                    setFloorsTable(plaformAssistantDispatch, { floors });
                    setFloorsLoading(false);
                    const floorsFiltered = filterFloors(floors);
                    setFloorsFiltered(floorsFiltered);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setFloorsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadFloors,
        floorsTable.length
    ]);

    useEffect(() => {
        if (buildingsTable.length !== 0) {
            const buildingsFiltered = filterBuildings(buildingsTable);
            setBuildingsFiltered(buildingsFiltered);
        }
    }, [buildingsTable]);

    useEffect(() => {
        if (floorsTable.length !== 0) {
            const floorsFiltered = filterFloors(floorsTable);
            setFloorsFiltered(floorsFiltered);
        }
    }, [floorsTable]);

    const refreshBuildings = useCallback(() => {
        setReloadBuildings(true);
        setBuildingsLoading(true);
        setTimeout(() => setReloadBuildings(false), 500);
    }, []);

    const refreshFloors = useCallback(() => {
        setReloadloors(true);
        setFloorsLoading(true);
        setTimeout(() => setReloadloors(false), 500);
    }, []);

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

    const selectFloor = (floor: IFloor) => {
        setFloorSelected(floor);
    }

    return (
        <>

            {groupsOptionToShow === GROUPS_OPTIONS.CREATE_GROUP &&
                <CreateGroup
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
                <>
                    {
                        (buildingsLoading || floorsLoading) ?
                            <Loader />
                            :
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
            }
        </>
    )
}

export default GroupsContainer;

