import { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import { axiosAuth, getDomainName, axiosInstance } from '../../../tools/tools';
import Loader from "../../Tools/Loader";
import elaspsedTimeFormat from '../../../tools/elapsedTimeFormat';
import { ORG_ADMIN_OPTIONS } from '../Utils/platformAssistantOptions';
import { OrgUsersProvider } from '../../../contexts/orgUsersOptions';
import OrgUsersContainer from './OrgUsersContainer';
import { GroupsProvider } from '../../../contexts/groupsOptions';
import GroupsContainer from './GroupsContainer';
import { IOrgUser } from '../TableColumns/orgUsersColumns';
import { OrgsManagedProvider } from '../../../contexts/orgsManagedOptions';
import {
    usePlatformAssitantDispatch,
    useOrgsManagedTable,
    useOrgUsersTable,
    useGroupsTable,
    useReloadGroupsTable,
    setOrgsManagedTable,
    setOrgUsersTable,
    setGroupsTable,
    setReloadGroupsTable,
    useGlobalUsersTable,
    setGlobalUsersTable,
    useBuildingsTable,
    useFloorsTable,
    setBuildingsTable,
    setFloorsTable,
    useReloadOrgsManagedTable,
    setReloadOrgsManagedTable,
    useReloadOrgUsersTable,
    setReloadOrgUsersTable,
    setReloadGlobalUsersTable,
    useMasterDevicesTable,
    setMasterDevicesTable,
} from '../../../contexts/platformAssistantContext';
import OrgsManagedContainer from './OrgsManagedContainer';
import { filterBuildings } from '../../../tools/filterBuildings';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { filterFloors } from '../../../tools/filterFloors';
import { IGlobalUser } from '../TableColumns/globalUsersColumns';
import { MasterDevicesProvider } from '../../../contexts/masterDevicesOptions';
import MasterDevicesInOrgsContainer from './MasterDevicesInOrgsContainer';


const OrganizationAdminOptionsContainer = styled.div`
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

const OrganizationAdminOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const orgsManagedTable = useOrgsManagedTable();
    const masterDevicesTable = useMasterDevicesTable();
    const orgUsersTable = useOrgUsersTable();
    const groupsTable = useGroupsTable();
    const globalUsersTable = useGlobalUsersTable();
    const [buildingsLoading, setBuildingsLoading] = useState(true);
    const [floorsLoading, setFloorsLoading] = useState(true);
    const [orgsManagedLoading, setOrgsManagedLoading] = useState(true);
    const [masterDevicesLoading, setMasterDevicesLoading] = useState(true);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [orgUsersLoading, setOrgUsersLoading] = useState(true);
    const [globalUsersLoading, setGlobalUsersLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(ORG_ADMIN_OPTIONS.ORGS_MANAGED);
    const [buildingsFiltered, setBuildingsFiltered] = useState<IBuilding[]>([]);
    const [floorsFiltered, setFloorsFiltered] = useState<IFloor[]>([]);

    const [reloadBuildings, setReloadBuildings] = useState(false);
    const [reloadFloors, setReloadloors] = useState(false);
    const reloadOrgsManagedTable = useReloadOrgsManagedTable();
    const [reloadMasterDevices, setReloadMasterDevices] = useState(false);
    const reloadOrgUsersTable = useReloadOrgUsersTable();
    const reloadGroupsTable = useReloadGroupsTable();

    const refreshOrgsManaged = useCallback(() => {
        setOrgsManagedLoading(true);
        const reloadOrgsManagedTable = true;
        setReloadOrgsManagedTable(plaformAssistantDispatch, { reloadOrgsManagedTable });
    }, [plaformAssistantDispatch]);

    const refreshMasterDevices = useCallback(() => {
        setReloadMasterDevices(true);
        setMasterDevicesLoading(true);
        setTimeout(() => setReloadMasterDevices(false), 500);
    }, []);


    const refreshOrgUsers = useCallback(() => {
        setOrgUsersLoading(true);
        const reloadOrgUsersTable = true;
        setReloadOrgUsersTable(plaformAssistantDispatch, { reloadOrgUsersTable });
    }, [plaformAssistantDispatch,])


    const refreshGroups = useCallback(() => {
        setGroupsLoading(true);
        const reloadGroupsTable = true;
        setReloadGroupsTable(plaformAssistantDispatch, { reloadGroupsTable });
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


    useEffect(() => {
        if (orgsManagedTable.length === 0 || reloadOrgsManagedTable) {
            const urlOrgsManaged = `https://${domainName}/admin_api/organizations/user_managed/`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlOrgsManaged, config)
                .then((response) => {
                    const orgsManaged = response.data;
                    setOrgsManagedTable(plaformAssistantDispatch, { orgsManaged });
                    setOrgsManagedLoading(false);
                    const reloadOrgsManagedTable = false;
                    setReloadOrgsManagedTable(plaformAssistantDispatch, { reloadOrgsManagedTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setOrgsManagedLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadOrgsManagedTable,
        orgsManagedTable.length
    ]);

    useEffect(() => {
        if (masterDevicesTable.length === 0 || reloadMasterDevices) {
            const urlMasterDevices = `https://${domainName}/admin_api/master_devices/user_managed`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlMasterDevices, config)
                .then((response) => {
                    const masterDevices = response.data;
                    masterDevices.forEach((masterDevice: { groupId: string | null; deviceId: string | null; }) => {
                        if (masterDevice.groupId === null) masterDevice.groupId = "-";
                        if (masterDevice.deviceId === null) masterDevice.deviceId = "-";
                    });
                    setMasterDevicesTable(plaformAssistantDispatch, { masterDevices });
                    setMasterDevicesLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });

        } else {
            setMasterDevicesLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadMasterDevices,
        plaformAssistantDispatch,
        masterDevicesTable.length
    ]);

    useEffect(() => {
        if (orgUsersTable.length === 0 || reloadOrgUsersTable) {
            const config = axiosAuth(accessToken);
            const urlOrganizationUsers = `https://${domainName}/admin_api/organization_users/user_orgs_managed/`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlOrganizationUsers, config)
                .then((response) => {
                    const orgUsers = response.data.filter((user: IOrgUser) => user.login.slice(-9) !== "api_admin");
                    orgUsers.map((user: IOrgUser) => {
                        user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
                        return user;
                    })
                    setOrgUsersTable(plaformAssistantDispatch, { orgUsers });
                    setOrgUsersLoading(false);
                    const reloadOrgUsersTable = false;
                    setReloadOrgUsersTable(plaformAssistantDispatch, { reloadOrgUsersTable });
                    const reloadGlobalUsersTable = false;
                    setReloadGlobalUsersTable(plaformAssistantDispatch, { reloadGlobalUsersTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setOrgUsersLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadOrgUsersTable,
        orgUsersTable.length
    ]);

    useEffect(() => {
        if (groupsTable.length === 0 || reloadGroupsTable) {
            const config = axiosAuth(accessToken);
            const urlGroups = `https://${domainName}/admin_api/groups/user_managed`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGroups, config)
                .then((response) => {
                    const groups = response.data;
                    groups.map((group: { isOrgDefaultGroup: string; }) => {
                        group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Default" : "Generic";
                        return group;
                    })
                    setGroupsTable(plaformAssistantDispatch, { groups });
                    setGroupsLoading(false);
                    const reloadGroupsTable = false;
                    setReloadGroupsTable(plaformAssistantDispatch, { reloadGroupsTable });
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        plaformAssistantDispatch,
        reloadGroupsTable,
        groupsTable.length
    ]);

    useEffect(() => {
        if (globalUsersTable.length === 0 || reloadOrgUsersTable) {
            const config = axiosAuth(accessToken);
            const urlGlobalUsers = `https://${domainName}/admin_api/application/global_users`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGlobalUsers, config)
                .then((response) => {
                    const globalUsers = response.data.filter((user: IGlobalUser) => user.login.slice(-9) !== "api_admin");
                    globalUsers.map((user: { roleInPlatform: string; lastSeenAtAge: string, isGrafanaAdmin: boolean }) => {
                        user.roleInPlatform = user.isGrafanaAdmin ? "Admin" : "";
                        user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
                        return user;
                    })
                    setGlobalUsersTable(plaformAssistantDispatch, { globalUsers });
                    setGlobalUsersLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGlobalUsersLoading(false);
        }

    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadOrgUsersTable,
        plaformAssistantDispatch,
        globalUsersTable.length
    ]);


    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }


    return (
        <>
            <OrganizationAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === ORG_ADMIN_OPTIONS.ORGS_MANAGED} onClick={() => clickHandler(ORG_ADMIN_OPTIONS.ORGS_MANAGED)}>
                    Orgs managed
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === ORG_ADMIN_OPTIONS.ORG_USERS} onClick={() => clickHandler(ORG_ADMIN_OPTIONS.ORG_USERS)}>
                    Org users
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === ORG_ADMIN_OPTIONS.GROUPS} onClick={() => clickHandler(ORG_ADMIN_OPTIONS.GROUPS)}>
                    Groups
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === ORG_ADMIN_OPTIONS.MASTER_DEVICES_IN_ORGS} onClick={() => clickHandler(ORG_ADMIN_OPTIONS.MASTER_DEVICES_IN_ORGS)}>
                    Master devices in orgs
                </OptionContainer>
            </OrganizationAdminOptionsContainer>
            <ContentContainer >
                {
                    (
                        buildingsLoading ||
                        floorsLoading ||
                        orgsManagedLoading ||
                        groupsLoading ||
                        orgUsersLoading ||
                        globalUsersLoading ||
                        masterDevicesLoading
                    ) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === ORG_ADMIN_OPTIONS.ORGS_MANAGED &&
                                <OrgsManagedProvider>
                                    <OrgsManagedContainer orgsManaged={orgsManagedTable} refreshOrgsManaged={refreshOrgsManaged} refreshOrgUsers={refreshOrgUsers} />
                                </OrgsManagedProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.ORG_USERS &&
                                <OrgUsersProvider>
                                    <OrgUsersContainer orgUsers={orgUsersTable} refreshOrgUsers={refreshOrgUsers} />
                                </OrgUsersProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.GROUPS &&
                                <GroupsProvider>
                                    <GroupsContainer
                                        buildingsFiltered={buildingsFiltered}
                                        floorsFiltered={floorsFiltered}
                                        groups={groupsTable}
                                        refreshGroups={refreshGroups}
                                        refreshBuildings={refreshBuildings}
                                        refreshFloors={refreshFloors}
                                    />
                                </GroupsProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.MASTER_DEVICES_IN_ORGS &&
                                <MasterDevicesProvider>
                                    <MasterDevicesInOrgsContainer masterDevices={masterDevicesTable} refreshMasterDevices={refreshMasterDevices}/>
                                </MasterDevicesProvider>
                            }
                        </>
                }
            </ContentContainer>
        </>
    )
}

export default OrganizationAdminOptions;

