import axios from 'axios';
import { FC, SetStateAction, useEffect, useState } from 'react'
import styled from "styled-components";
import { useAuthState } from '../../contexts/authContext';
import { axiosAuth, getDomainName } from '../../tools/tools';
import { ORGS_MANAGED_COLUMNS } from './TableColumns/organizationsManagedColumns';
import TableWithPagination from './TableWithPagination';
import Loader from "../Tools/Loader";
import elaspsedTimeFormat from '../../tools/elapsedTimeFormat';
import { ORG_ADMIN_OPTIONS } from './platformAssistantOptions';
import { OrgUsersProvider } from '../../contexts/orgUsers';
import OrgUsersContainer from './OrgUsersContainer';
import { GroupsProvider } from '../../contexts/groups';
import GroupsContainer from './GroupsContainer';
import { IOrgUser } from './TableColumns/orgUsersColumns';

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
    const { accessToken } = useAuthState();
    const [orgsManaged, setOrgsManaged] = useState([]);
    const [groups, setGroups] = useState([]);
    const [orgUsers, setOrgUsers] = useState([]);
    const [orgsManagedLoading, setOrgsManagedLoading] = useState(true);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [orgUsersLoading, setOrgUsersLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(ORG_ADMIN_OPTIONS.ORGS_MANAGED);
    const [reloadOrgUsers, setReloadOrgUsers] = useState(0);
    const [reloadGroups, setReloadGroups] = useState(0);

    // const [reloadOrgsManaged, setReloadOrgsManaged] = useState(0);
    // const refreshOrgsManaged = () => {
    //     setReloadOrgsManaged(reloadOrgsManaged + 1);
    //     setOrgsManagedLoading(true);
    // }

    const refreshOrgUsers = () => {
        setReloadOrgUsers(reloadOrgUsers + 1);
        setOrgUsersLoading(true);
    }

    const refreshGroups = () => {
        setReloadGroups(reloadGroups + 1);
        setGroupsLoading(true);
    }

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
    }, [accessToken]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlOrganizationUsers = `https://${domainName}/admin_api/organization_users/user_managed/`;
        axios
            .get(urlOrganizationUsers, config)
            .then((response) => {
                const users: IOrgUser[] = response.data;
                users.map(user => {
                    user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
                    return user;
                })
                setOrgUsers(users as unknown as SetStateAction<never[]>);
                setOrgUsersLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [accessToken, reloadOrgUsers]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
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
    }, [accessToken, reloadGroups]);

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
            </OrganizationAdminOptionsContainer>
            <ContentContainer >
                {(orgsManagedLoading || groupsLoading || orgUsersLoading) ?
                    <Loader />
                    :
                    <>
                        {optionToShow === ORG_ADMIN_OPTIONS.ORGS_MANAGED &&
                            <TableWithPagination
                                dataTable={orgsManaged}
                                columnsTable={ORGS_MANAGED_COLUMNS}
                                componentName=""
                            />
                        }
                        {optionToShow === ORG_ADMIN_OPTIONS.ORG_USERS &&
                            <OrgUsersProvider>
                                <OrgUsersContainer orgUsers={orgUsers} refreshOrgUsers={refreshOrgUsers} />
                            </OrgUsersProvider>
                        }
                        {optionToShow === ORG_ADMIN_OPTIONS.GROUPS &&
                            <GroupsProvider>
                                <GroupsContainer groups={groups} refreshGroups={refreshGroups} />
                            </GroupsProvider>
                        }
                    </>
                }
            </ContentContainer>
        </>
    )
}

export default OrganizationAdminOptions;
