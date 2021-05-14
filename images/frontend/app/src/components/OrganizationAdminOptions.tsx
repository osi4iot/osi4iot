import axios from 'axios';
import { FC, useEffect, useState } from 'react'
import { Redirect } from 'react-router-dom';
import styled from "styled-components";
import { useAuthState } from '../contexts/authContext';
import { axiosAuth, getDomainName } from '../tools/tools';
import { GROUPS_COLUMNS } from './TableColumns/groupsColumns';
import { ORG_USERS_COLUMNS } from './TableColumns/orgUsersColumns';
import { ORGS_MANAGED_COLUMNS } from './TableColumns/organizationsManagedColumns';
import TableWithPagination from './TableWithPagination';
import { useIsOrgAdmin, useIsPlatformAdmin } from '../contexts/platformAssistantContext';
import Loader from "./Loader";

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
`;

const domainName = getDomainName();

const OrganizationAdminOptions: FC<{}> = () => {
    const isPlatformAdmin = useIsPlatformAdmin();
    const isOrgAdmin = useIsOrgAdmin();
    const { accessToken } = useAuthState();
    const [optionToShow, setOptionToShow] = useState("Orgs managed");
    const [orgsManaged, setOrgsManaged] = useState([]);
    const [groups, setGroups] = useState([]);
    const [orgUsers, setOrgUsers] = useState([]);
    const [orgsManagedLoading, setOrgsManagedLoading] = useState(true);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [orgUsersLoading, setOrgUsersLoading] = useState(true);

    useEffect(() => {
        const urlOrgsManaged = `https://${domainName}/admin_api/organizations/user_managed/`;
        const config = axiosAuth(accessToken);
        axios
            .get(urlOrgsManaged, config)
            .then((response) => {
                const orgsManaged = response.data;
                setOrgsManaged(orgsManaged);
                setOrgsManagedLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });


        const urlOrganizationUsers = `https://${domainName}/admin_api/organization_users/user_managed/`;
        axios
            .get(urlOrganizationUsers, config)
            .then((response) => {
                const users = response.data;
                setOrgUsers(users);
                setOrgUsersLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });


        const urlGroups = `https://${domainName}/admin_api/groups/user_managed`;
        axios
            .get(urlGroups, config)
            .then((response) => {
                const groups = response.data;
                groups.map((group: { isOrgDefaultGroup: string; }) => {
                    group.isOrgDefaultGroup = group.isOrgDefaultGroup ? "Yes" : "No";
                    return group;
                })
                setGroups(groups);
                setGroupsLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    if (!(isPlatformAdmin || isOrgAdmin)) {
        <Redirect to="/401/org" />
    }

    return (
        <>
            <OrganizationAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === "Orgs managed"} onClick={() => clickHandler("Orgs managed")}>
                    Orgs managed
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Org Users"} onClick={() => clickHandler("Org Users")}>
                    Org Users
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Groups"} onClick={() => clickHandler("Groups")}>
                    Groups
                </OptionContainer>
            </OrganizationAdminOptionsContainer>
            <ContentContainer >
                {(orgsManagedLoading || groupsLoading || orgUsersLoading) ?
                    <Loader />
                    :
                    <>
                        {optionToShow === "Orgs managed" && <TableWithPagination dataTable={orgsManaged} columnsTable={ORGS_MANAGED_COLUMNS} componentName="" />}
                        {optionToShow === "Org Users" && <TableWithPagination dataTable={orgUsers} columnsTable={ORG_USERS_COLUMNS} componentName="org user" />}
                        {optionToShow === "Groups" && <TableWithPagination dataTable={groups} columnsTable={GROUPS_COLUMNS} componentName="group" />}
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default OrganizationAdminOptions;
