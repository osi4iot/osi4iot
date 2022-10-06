import { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, axiosInstance, getProtocol } from '../../../tools/tools';
import Loader from "../../Tools/Loader";
import { GROUP_ADMIN_OPTIONS } from '../Utils/platformAssistantOptions';
import DevicesContainer from './DevicesContainer';
import GroupMembersContainer from './GroupMembersContainer';
import { GroupMembersProvider } from '../../../contexts/groupMembersOptions';
import { DevicesProvider } from '../../../contexts/devicesOptions';
import {
    usePlatformAssitantDispatch,
    useGroupsManagedTable,
    useDevicesTable,
    useGroupMembersTable,
    useSelectOrgUsersTable,
    setGroupsManagedTable,
    setGroupMembersTable,
    setDevicesTable,
    setSelectOrgUsersTable,
    useTopicsTable,
    useDigitalTwinsTable,
    setTopicsTable,
    setDigitalTwinsTable,
    useBuildingsTable,
    useFloorsTable,
    setBuildingsTable,
    setFloorsTable,
    useOrgsOfGroupsManagedTable,
    setOrgsOfGroupsManagedTable,
    useDashboardsTable,
    setDashboardsTable,
    useReloadSelectOrgUsersTable,
    setReloadSelectOrgUsersTable,
    useReloadGroupMembersTable,
    setReloadGroupMembersTable,
    useReloadDevicesTable,
    setReloadDevicesTable,
    useReloadTopicsTable,
    setReloadTopicsTable,
    useReloadDashboardsTable,
    setReloadDashboardsTable,
    useReloadDigitalTwinsTable,
    setReloadDigitalTwinsTable,
    useReloadGroupsManagedTable,
    setReloadGroupsManagedTable
} from '../../../contexts/platformAssistantContext';
import { GroupsManagedProvider } from '../../../contexts/groupsManagedOptions';
import GroupsManagedContainer from './GroupsManagedContainer';
import { TopicsProvider } from '../../../contexts/topicsOptions';
import TopicsContainer from './TopicsContainer';
import { DigitalTwinsProvider } from '../../../contexts/digitalTwinsOptions';
import DigitalTwinsContainer from './DigitalTwinsContainer';
import { MeasurementsProvider } from '../../../contexts/measurementsOptions';
import MeasurementsContainer from './MeasurementsContainer';
import { filterBuildings } from '../../../tools/filterBuildings';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { filterFloors } from '../../../tools/filterFloors';
import { ISelectOrgUser } from '../TableColumns/selectOrgUsersColumns';
import { DASHBOARD_COLUMNS } from '../TableColumns/dashboardsColumns';
import TableWithPagination from '../Utils/TableWithPagination';
import { toast } from 'react-toastify';

const GroupAdminOptionsContainer = styled.div`
	display: flex;
	flex-direction: row;
    justify-content: flex-start;
	align-items: center;
    width: 60%;
    height: 50px;
    background-color: #0c0d0f;
`;

interface OptionContainerProps {
    isOptionActive: boolean;
}

const OptionContainer = styled.div<OptionContainerProps>`
	color: "white";
    margin: 10px 20px 0 20px;
    background-color: ${(props) => props.isOptionActive ? "#202226" : "#0c0d0f"};
    padding: 10px 10px 10px 10px;
    border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid #0c0d0f"};
    align-content: center;

    &:hover {
        cursor: pointer;
        background-color: #202226;
        border-top: ${(props) => props.isOptionActive ? "3px solid #3274d9;" : "3px solid white"};
    }
`;


const ContentContainer = styled.div`
    width: calc(100vw - 75px);
    height: calc(100vh - 200px);
    background-color: #202226;
    margin-bottom: 5px;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;

        /* width */
        ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    /* Track */
    ::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    ::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    ::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    ::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }
`;

const domainName = getDomainName();
const protocol = getProtocol();

const GroupAdminOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [optionToShow, setOptionToShow] = useState(GROUP_ADMIN_OPTIONS.GROUPS_MANAGED);
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const orgsOfGroupManagedTable = useOrgsOfGroupsManagedTable();
    const groupsManagedTable = useGroupsManagedTable();
    const devicesTable = useDevicesTable();
    const groupMembersTable = useGroupMembersTable();
    const selectOrgUsersTable = useSelectOrgUsersTable();
    const topicsTable = useTopicsTable();
    const dashboardsTable = useDashboardsTable();
    const digitalTwinsTable = useDigitalTwinsTable();
    const [buildingsLoading, setBuildingsLoading] = useState(true);
    const [floorsLoading, setFloorsLoading] = useState(true);
    const [orgsOfGroupsManagedLoading, setOrgsOfGroupsManagedLoading] = useState(true);
    const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [topicsLoading, setTopicsLoading] = useState(true);
    const [dashboardsLoading, setDashboardsLoading] = useState(true);
    const [digitalTwinsLoading, setDigitalTwinsLoading] = useState(true);
    const [groupMembersLoading, setGroupMembersLoading] = useState(true);
    const [selectOrgUsersLoading, setSelectOrgUsersLoading] = useState(true);

    const [reloadBuildings, setReloadBuildings] = useState(false);
    const [reloadFloors, setReloadloors] = useState(false);
    const reloadGroupsManagedTable = useReloadGroupsManagedTable();
    const reloadGroupMembersTable = useReloadGroupMembersTable();
    const reloadDevicesTable = useReloadDevicesTable();
    const reloadTopicsTable = useReloadTopicsTable();
    const reloadDashboardsTable = useReloadDashboardsTable();
    const reloadDigitalTwinsTable = useReloadDigitalTwinsTable();
    const [buildingsFiltered, setBuildingsFiltered] = useState<IBuilding[]>([]);
    const [floorsFiltered, setFloorsFiltered] = useState<IFloor[]>([]);
    const reloadSelectOrgUsersTable = useReloadSelectOrgUsersTable();

    const refreshGroupsManaged = useCallback(() => {
        setGroupsManagedLoading(true);
        const reloadGroupsManagedTable = true;
        setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });
    }, [plaformAssistantDispatch]);

    const refreshDevices = useCallback(() => {
        setDevicesLoading(true);
        const reloadDevicesTable = true;
        setReloadDevicesTable(plaformAssistantDispatch, { reloadDevicesTable });
    }, [plaformAssistantDispatch])


    const refreshGroupMembers = useCallback(() => {
        setGroupMembersLoading(true);
        const reloadGroupMembersTable = true;
        setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
    }, [plaformAssistantDispatch])

    const refreshTopics = useCallback(() => {
        setTopicsLoading(true);
        const reloadTopicsTable = true;
        setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
    }, [plaformAssistantDispatch])

    const refreshDashboards = useCallback(() => {
        setDashboardsLoading(true);
        const reloadDashboardsTable = true;
        setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
    }, [plaformAssistantDispatch])

    const refreshDigitalTwins = useCallback(() => {
        setDigitalTwinsLoading(true);
        const reloadDigitalTwinsTable = true;
        setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
    }, [plaformAssistantDispatch])

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

    useEffect(() => {
        if (buildingsTable.length === 0 || reloadBuildings) {
            const urlBuildings = `${protocol}://${domainName}/admin_api/buildings/user_groups_managed/`;
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
            const urlFloors = `${protocol}://${domainName}/admin_api/building_floors/user_groups_managed/`;
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


    useEffect(() => {
        if (orgsOfGroupManagedTable.length === 0) {
            const config = axiosAuth(accessToken);
            const urlOrgsOfGroupsManaged = `${protocol}://${domainName}/admin_api/organizations/user_groups_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlOrgsOfGroupsManaged, config)
                .then((response) => {
                    const orgsOfGroupsManaged = response.data;
                    setOrgsOfGroupsManagedTable(plaformAssistantDispatch, { orgsOfGroupsManaged });
                    setOrgsOfGroupsManagedLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setOrgsOfGroupsManagedLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, orgsOfGroupManagedTable.length]);

    useEffect(() => {
        if (groupsManagedTable.length === 0 || reloadGroupsManagedTable) {
            const config = axiosAuth(accessToken);
            const urlGroupsManaged = `${protocol}://${domainName}/admin_api/groups/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGroupsManaged, config)
                .then((response) => {
                    const groupsManaged = response.data;
                    groupsManaged.map((group: { isOrgDefaultGroup: string; }) => {
                        group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Default" : "Generic";
                        return group;
                    })
                    setGroupsManagedTable(plaformAssistantDispatch, { groupsManaged });
                    setGroupsManagedLoading(false);
                    const reloadGroupsManagedTable = false;
                    setReloadGroupsManagedTable(plaformAssistantDispatch, { reloadGroupsManagedTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupsManagedLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadGroupsManagedTable,
        groupsManagedTable.length
    ]);

    useEffect(() => {
        if (groupMembersTable.length === 0 || reloadGroupMembersTable) {
            const config = axiosAuth(accessToken);
            const urlGroupMembers = `${protocol}://${domainName}/admin_api/group_members/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGroupMembers, config)
                .then((response) => {
                    const groupMembers = response.data;
                    setGroupMembersTable(plaformAssistantDispatch, { groupMembers });
                    setGroupMembersLoading(false);
                    const reloadGroupMembersTable = false;
                    setReloadGroupMembersTable(plaformAssistantDispatch, { reloadGroupMembersTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupMembersLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadGroupMembersTable,
        groupMembersTable.length
    ]);

    useEffect(() => {
        if (selectOrgUsersTable.length === 0 || reloadSelectOrgUsersTable) {
            const config = axiosAuth(accessToken);
            const urlGroupsManaged = `${protocol}://${domainName}/admin_api/organization_users/user_groups_managed/`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGroupsManaged, config)
                .then((response) => {
                    const selectOrgUsers = response.data.filter((user: ISelectOrgUser) => user.login.slice(-9) !== "api_admin");
                    setSelectOrgUsersTable(plaformAssistantDispatch, { selectOrgUsers });
                    setSelectOrgUsersLoading(false);
                    const reloadSelectOrgUsersTable = false;
                    setReloadSelectOrgUsersTable(plaformAssistantDispatch, { reloadSelectOrgUsersTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setSelectOrgUsersLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, plaformAssistantDispatch, reloadSelectOrgUsersTable, selectOrgUsersTable.length]);

    useEffect(() => {
        if (devicesTable.length === 0 || reloadDevicesTable) {
            const config = axiosAuth(accessToken);
            const urlDevices = `${protocol}://${domainName}/admin_api/devices/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDevices, config)
                .then((response) => {
                    const devices = response.data;
                    console.log("devices=", devices)
                    setDevicesTable(plaformAssistantDispatch, { devices });
                    setDevicesLoading(false);
                    const reloadDevicesTable = false;
                    setReloadDevicesTable(plaformAssistantDispatch, { reloadDevicesTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setDevicesLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadDevicesTable,
        devicesTable.length
    ]);


    useEffect(() => {
        if (topicsTable.length === 0 || reloadTopicsTable) {
            const config = axiosAuth(accessToken);
            const urlTopics = `${protocol}://${domainName}/admin_api/topics/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlTopics, config)
                .then((response) => {
                    const topics = response.data;
                    topics.map((topic: { payloadFormat: Object; }) => {
                        topic.payloadFormat = JSON.stringify(topic.payloadFormat);
                        return topic;
                    })
                    setTopicsTable(plaformAssistantDispatch, { topics });
                    setTopicsLoading(false);
                    const reloadTopicsTable = false;
                    setReloadTopicsTable(plaformAssistantDispatch, { reloadTopicsTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setTopicsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadTopicsTable,
        topicsTable.length
    ]);

    useEffect(() => {
        if (dashboardsTable.length === 0 || reloadDashboardsTable) {
            const config = axiosAuth(accessToken);
            const urlDashboards = `${protocol}://${domainName}/admin_api/dashboards/user_managed/`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDashboards, config)
                .then((response) => {
                    const dashboards = response.data;
                    setDashboardsTable(plaformAssistantDispatch, { dashboards });
                    setDashboardsLoading(false);
                    const reloadDashboardsTable = false;
                    setReloadDashboardsTable(plaformAssistantDispatch, { reloadDashboardsTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setDashboardsLoading(false);
        }

    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadDashboardsTable,
        dashboardsTable.length
    ]);

    useEffect(() => {
        if (digitalTwinsTable.length === 0 || reloadDigitalTwinsTable) {
            const config = axiosAuth(accessToken);
            const urlDigitalTwins = `${protocol}://${domainName}/admin_api/digital_twins/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlDigitalTwins, config)
                .then((response) => {
                    const digitalTwins = response.data;
                    setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
                    setDigitalTwinsLoading(false);
                    const reloadDigitalTwinsTable = false;
                    setReloadDigitalTwinsTable(plaformAssistantDispatch, { reloadDigitalTwinsTable });
                })
                .catch((error) => {
                    const digitalTwins: never[] = [];
                    setDigitalTwinsTable(plaformAssistantDispatch, { digitalTwins });
                    setDigitalTwinsLoading(false);
                    const errorMessage = error.response.data.message;
                    if(errorMessage !== "jwt expired") toast.error(errorMessage);
                    console.log(error);
                });
        } else {
            setDigitalTwinsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadDigitalTwinsTable,
        digitalTwinsTable.length
    ]);



    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    return (
        <>
            <GroupAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.GROUPS_MANAGED} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.GROUPS_MANAGED)}>
                    Groups managed
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.GROUP_MEMBERS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.GROUP_MEMBERS)}>
                    Group members
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.DEVICES} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.DEVICES)}>
                    Devices
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.TOPICS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.TOPICS)}>
                    Topics
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.MEASUREMENTS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.MEASUREMENTS)}>
                    Measurements
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.DASHBOARDS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.DASHBOARDS)}>
                    Dashboards
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.DIGITAL_TWINS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.DIGITAL_TWINS)}>
                    Digital twins
                </OptionContainer>
            </GroupAdminOptionsContainer>
            <ContentContainer>
                {
                    (buildingsLoading ||
                        floorsLoading ||
                        orgsOfGroupsManagedLoading ||
                        groupsManagedLoading ||
                        devicesLoading ||
                        groupMembersLoading ||
                        selectOrgUsersLoading ||
                        topicsLoading ||
                        dashboardsLoading ||
                        digitalTwinsLoading
                    ) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === GROUP_ADMIN_OPTIONS.GROUPS_MANAGED &&
                                <GroupsManagedProvider>
                                    <GroupsManagedContainer
                                        groupsManaged={groupsManagedTable}
                                        refreshGroupsManaged={refreshGroupsManaged}
                                        refreshGroupMembers={refreshGroupMembers}
                                    />
                                </GroupsManagedProvider>
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.GROUP_MEMBERS &&
                                <GroupMembersProvider>
                                    <GroupMembersContainer groupMembers={groupMembersTable} refreshGroupMembers={refreshGroupMembers} />
                                </GroupMembersProvider>
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.DEVICES &&
                                <DevicesProvider>
                                    <DevicesContainer
                                        orgsOfGroupManaged={orgsOfGroupManagedTable}
                                        groupsManaged={groupsManagedTable}
                                        buildingsFiltered={buildingsFiltered}
                                        floorsFiltered={floorsFiltered}
                                        devices={devicesTable}
                                        refreshDevices={refreshDevices}
                                        refreshGroups={refreshGroupsManaged}
                                        refreshBuildings={refreshBuildings}
                                        refreshFloors={refreshFloors}
                                    />
                                </DevicesProvider>
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.TOPICS &&
                                <TopicsProvider>
                                    <TopicsContainer topics={topicsTable} refreshTopics={refreshTopics} />
                                </TopicsProvider>
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.MEASUREMENTS &&
                                <MeasurementsProvider>
                                    <MeasurementsContainer topics={topicsTable} devices={devicesTable} />
                                </MeasurementsProvider>
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.DASHBOARDS &&
                                <TableWithPagination
                                    dataTable={dashboardsTable}
                                    columnsTable={DASHBOARD_COLUMNS}
                                    reloadTable={refreshDashboards}
                                    componentName=""
                                />
                            }
                            {optionToShow === GROUP_ADMIN_OPTIONS.DIGITAL_TWINS &&
                                <DigitalTwinsProvider>
                                    <DigitalTwinsContainer digitalTwins={digitalTwinsTable} refreshDigitalTwins={refreshDigitalTwins} />
                                </DigitalTwinsProvider>
                            }
                        </>
                }
            </ContentContainer>
        </>
    )
}

export default GroupAdminOptions
