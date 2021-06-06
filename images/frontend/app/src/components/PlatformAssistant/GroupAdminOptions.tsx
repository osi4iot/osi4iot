import axios from 'axios';
import { FC, useEffect, useState } from 'react'
import styled from "styled-components";
import { useAuthState } from '../../contexts/authContext';
import { axiosAuth, getDomainName } from '../../tools/tools';
import Loader from "../Tools/Loader";
import { GROUP_ADMIN_OPTIONS } from './platformAssistantOptions';
import DevicesContainer from './DevicesContainer';
import GroupMembersContainer from './GroupMembersContainer';
import { GroupMembersProvider } from '../../contexts/groupMembersOptions';
import { DevicesProvider } from '../../contexts/devicesOptions';
import {
    usePlatformAssitantDispatch,
    useGroupsManagedTable,
    useDevicesTable,
    useGroupMembersTable,
    useSelectOrgUsersTable,
    setGroupsManagedTable,
    setGroupMembersTable,
    setDevicesTable,
    setSelectOrgUsersTable
} from '../../contexts/platformAssistantContext';
import { GroupsManagedProvider } from '../../contexts/groupsManagedOptions';
import GroupsManagedContainer from './GroupsManagedContainer';

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

const GroupAdminOptions: FC<{}> = () => {
    const { accessToken } = useAuthState();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const [optionToShow, setOptionToShow] = useState(GROUP_ADMIN_OPTIONS.GROUPS_MANAGED);
    const groupsManagedTable = useGroupsManagedTable();
    const devicesTable = useDevicesTable();
    const groupMembersTable = useGroupMembersTable();
    const selectOrgUsersTable = useSelectOrgUsersTable()
    const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
    const [deviceLoading, setDevicesLoading] = useState(true);
    const [groupMembersLoading, setGroupMembersLoading] = useState(true);
    const [selectOrgUsersLoading, setSelectOrgUsersLoading] = useState(true);
    const [reloadGroupsManaged, setReloadGroupsManaged] = useState(false);
    const [reloadGroupMembers, setReloadGroupMembers] = useState(false);
    const [reloadDevices, setReloadDevices] = useState(false);

    const refreshGroupsManaged = () => {
        setReloadGroupsManaged(true);
        setGroupsManagedLoading(true);
        setTimeout(() => setReloadGroupsManaged(false), 500);
    }

    const refreshDevices = () => {
        setReloadDevices(true);
        setDevicesLoading(true);
        setTimeout(() => setReloadDevices(false), 500);
    }

    const refreshGroupMembers = () => {
        setReloadGroupMembers(true);
        setGroupMembersLoading(true);
        setTimeout(() => setReloadGroupMembers(false), 500);
    }

    useEffect(() => {
        if (groupsManagedTable.length === 0 || reloadGroupsManaged) {
            const config = axiosAuth(accessToken);
            const urlGroupsManaged = `https://${domainName}/admin_api/groups/user_managed`;
            axios
                .get(urlGroupsManaged, config)
                .then((response) => {
                    const groupsManaged = response.data;
                    groupsManaged.map((group: { isOrgDefaultGroup: string; }) => {
                        group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Default" : "Generic";
                        return group;
                    })
                    setGroupsManagedTable(plaformAssistantDispatch, { groupsManaged });
                    setGroupsManagedLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupsManagedLoading(false);
        }
    }, [accessToken, plaformAssistantDispatch, reloadGroupsManaged, groupsManagedTable.length]);

    useEffect(() => {
        if (devicesTable.length === 0 || reloadDevices) {
            const config = axiosAuth(accessToken);
            const urlDevices = `https://${domainName}/admin_api/devices/user_managed`;
            axios
                .get(urlDevices, config)
                .then((response) => {
                    const devices = response.data;
                    devices.map((device: { isDefaultGroupDevice: string; }) => {
                        device.isDefaultGroupDevice = device.isDefaultGroupDevice ? "Default" : "Generic";
                        return device;
                    })
                    setDevicesTable(plaformAssistantDispatch, { devices });
                    setDevicesLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setDevicesLoading(false);
        }
    }, [accessToken, plaformAssistantDispatch, reloadDevices, devicesTable.length]);

    useEffect(() => {
        if (groupMembersTable.length === 0 || reloadGroupMembers) {
            const config = axiosAuth(accessToken);
            const urlGroupMembers = `https://${domainName}/admin_api/group_members/user_managed`;
            axios
                .get(urlGroupMembers, config)
                .then((response) => {
                    const groupMembers = response.data;
                    setGroupMembersTable(plaformAssistantDispatch, { groupMembers });
                    setGroupMembersLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setGroupMembersLoading(false);
        }
    }, [accessToken, plaformAssistantDispatch, reloadGroupMembers, groupMembersTable.length]);

    useEffect(() => {
        if (selectOrgUsersTable.length === 0 || reloadGroupsManaged) {
            const config = axiosAuth(accessToken);
            const urlGroupsManaged = `https://${domainName}/admin_api/organization_users/user_groups_managed/`;
            axios
                .get(urlGroupsManaged, config)
                .then((response) => {
                    const selectOrgUsers = response.data;
                    setSelectOrgUsersTable(plaformAssistantDispatch, { selectOrgUsers });
                    setSelectOrgUsersLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setSelectOrgUsersLoading(false);
        }
    }, [accessToken, plaformAssistantDispatch, reloadGroupsManaged, selectOrgUsersTable.length]);


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
            </GroupAdminOptionsContainer>
            <ContentContainer >
                {(groupsManagedLoading || deviceLoading || groupMembersLoading || selectOrgUsersLoading) ?
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
                                <DevicesContainer devices={devicesTable} refreshDevices={refreshDevices} />
                            </DevicesProvider>
                        }
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default GroupAdminOptions
