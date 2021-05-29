import axios from 'axios';
import { FC, useEffect, useState } from 'react'
import styled from "styled-components";
import { useAuthState } from '../../contexts/authContext';
import { axiosAuth, getDomainName } from '../../tools/tools';
import TableWithPagination from './TableWithPagination';
import Loader from "../Tools/Loader";
import { GROUPS_MANAGED_COLUMNS } from './TableColumns/groupsManagedColumns';
import { GROUP_ADMIN_OPTIONS } from './platformAssistantOptions';
import DevicesContainer from './DevicesContainer';
import GroupMembersContainer from './GroupMembersContainer';
import { GroupMembersProvider } from '../../contexts/groupMembers';
import { DevicesProvider } from '../../contexts/devices';

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
    const [optionToShow, setOptionToShow] = useState(GROUP_ADMIN_OPTIONS.GROUPS_MANAGED);
    const [groupsManaged, setGroupsManaged] = useState([]);
    const [devices, setDevices] = useState([]);
    const [groupMembers, setGroupMembers] = useState([]);
    const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
    const [deviceLoading, setDevicesLoading] = useState(true);
    const [groupMembersLoading, setGroupMembersLoading] = useState(true);

    const [reloadDevices, setReloadDevices] = useState(0);
    const [reloadGroupMembers, setReloadGroupMembers] = useState(0);

    const refreshDevices = () => {
        setReloadDevices(reloadDevices + 1);
        setDevicesLoading(true);
    }

    const refreshGroupMembers = () => {
        setReloadGroupMembers(reloadGroupMembers + 1);
        setGroupMembersLoading(true);
    }

    useEffect(() => {
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
                setGroupsManaged(groupsManaged);
                setGroupsManagedLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken]);

    useEffect(() => {
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
                setDevices(devices);
                setDevicesLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken, reloadDevices]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlGroupMembers = `https://${domainName}/admin_api/group_members/user_managed`;
        axios
            .get(urlGroupMembers, config)
            .then((response) => {
                const groupMembers = response.data;
                setGroupMembers(groupMembers);
                setGroupMembersLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken, reloadGroupMembers]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    return (
        <>
            <GroupAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.GROUPS_MANAGED} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.GROUPS_MANAGED)}>
                    Groups managed
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.DEVICES} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.DEVICES)}>
                    Devices
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === GROUP_ADMIN_OPTIONS.GROUP_MEMBERS} onClick={() => clickHandler(GROUP_ADMIN_OPTIONS.GROUP_MEMBERS)}>
                    Group members
                </OptionContainer>
            </GroupAdminOptionsContainer>
            <ContentContainer >
                {(groupsManagedLoading || deviceLoading || groupMembersLoading) ?
                    <Loader />
                    :
                    <>
                        {
                            optionToShow === GROUP_ADMIN_OPTIONS.GROUPS_MANAGED
                            &&
                            <TableWithPagination
                                dataTable={groupsManaged}
                                columnsTable={GROUPS_MANAGED_COLUMNS}
                                componentName=""
                            />
                        }
                        {optionToShow === GROUP_ADMIN_OPTIONS.GROUP_MEMBERS &&
                            <GroupMembersProvider>
                                <GroupMembersContainer groupMembers={groupMembers} refreshGroupMembers={refreshGroupMembers} />
                            </GroupMembersProvider>
                        }
                        {optionToShow === GROUP_ADMIN_OPTIONS.DEVICES &&
                            <DevicesProvider>
                                <DevicesContainer devices={devices} refreshDevices={refreshDevices} />
                            </DevicesProvider>
                        }
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default GroupAdminOptions
