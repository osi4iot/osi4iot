import axios from 'axios';
import { FC, useEffect, useState } from 'react'
import { Redirect } from 'react-router-dom';
import styled from "styled-components";
import { useAuthState } from '../contexts/authContext';
import { axiosAuth, getDomainName } from '../tools/tools';
import TableWithPagination from './TableWithPagination';
import { useIsGroupAdmin, useIsOrgAdmin, useIsPlatformAdmin } from '../contexts/platformAssistantContext';
import { GROUP_MEMBERS_COLUMNS } from './TableColumns/groupMemberColumns';
import { DEVICES_COLUMNS } from './TableColumns/devicesColumns';
import Loader from "./Loader";
import { GROUPS_MANAGED_COLUMNS } from './TableColumns/groupsManagedColumns';

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
`;

const domainName = getDomainName();

const GroupAdminOptions: FC<{}> = () => {
    const isPlatformAdmin = useIsPlatformAdmin();
    const isOrgAdmin = useIsOrgAdmin();
    const isGroupAdmin = useIsGroupAdmin();
    const { accessToken } = useAuthState();
    const [optionToShow, setOptionToShow] = useState("Groups managed");
    const [groupsManaged, setGroupsManaged] = useState([]);
    const [devices, setDevices] = useState([]);
    const [groupMembers, setGroupMembers] = useState([]);
    const [groupsManagedLoading, setGroupsManagedLoading] = useState(true);
    const [deviceLoading, setDevicesLoading] = useState(true);
    const [groupMembersLoading, setGroupMembersLoading] = useState(true);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlGroupsManaged = `https://${domainName}/admin_api/groups/user_managed`;
        axios
            .get(urlGroupsManaged, config)
            .then((response) => {
                const groupsManaged = response.data;
                groupsManaged.map((group: { isOrgDefaultGroup: string; }) => {
                    group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Yes" : "No";
                    return group;
                })
                setGroupsManaged(groupsManaged);
                setGroupsManagedLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });

        const urlDevices = `https://${domainName}/admin_api/devices/user_managed`;
        axios
            .get(urlDevices, config)
            .then((response) => {
                const devices = response.data;
                devices.map((device: { isDefaultGroupDevice: string; }) => {
                    device.isDefaultGroupDevice = device.isDefaultGroupDevice ? "Yes" : "No";
                    return device;
                })
                setDevices(devices);
                setDevicesLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });


        const urlGroupMembers = `https://${domainName}/admin_api/group_members/user_managed`;
        axios
            .get(urlGroupMembers, config)
            .then((response) => {
                const groupMembers = response.data;
                groupMembers.map((group: { isOrgDefaultGroup: string; }) => {
                    group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Yes" : "No";
                    return group;
                })
                setGroupMembers(groupMembers);
                setGroupMembersLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    if (!(isPlatformAdmin || isOrgAdmin || isGroupAdmin)) {
        <Redirect to="/401/group" />
    }

    return (
        <>
            <GroupAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === "Groups managed"} onClick={() => clickHandler("Groups managed")}>
                    Groups managed
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Devices"} onClick={() => clickHandler("Devices")}>
                    Devices
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Group members"} onClick={() => clickHandler("Group members")}>
                    Group members
                </OptionContainer>
            </GroupAdminOptionsContainer>
            <ContentContainer >
                {(groupsManagedLoading || deviceLoading || groupMembersLoading) ?
                    <Loader />
                    :
                    <>
                        {optionToShow === "Groups managed" && <TableWithPagination dataTable={groupsManaged} columnsTable={GROUPS_MANAGED_COLUMNS} componentName="" />}
                        {optionToShow === "Group members" && <TableWithPagination dataTable={groupMembers} columnsTable={GROUP_MEMBERS_COLUMNS} componentName="group member" />}                        
                        {optionToShow === "Devices" && <TableWithPagination dataTable={devices} columnsTable={DEVICES_COLUMNS} componentName="device" />}
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default GroupAdminOptions
