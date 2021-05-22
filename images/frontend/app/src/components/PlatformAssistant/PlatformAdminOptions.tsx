import React, { FC, SetStateAction, useEffect, useState } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName } from '../../tools/tools';
import axios from 'axios';
import { useAuthState } from '../../contexts/authContext';
import TableWithPagination from './TableWithPagination';
import Loader from "../Tools/Loader";
import PlatformTools from './PlatformToolsOptions';
import { IRefreshToken, Create_REFRESH_TOKENS_COLUMNS } from './TableColumns/refreshTokensColumns';
import elaspsedTimeFormat from '../../tools/elapsedTimeFormat';
import { PLATFORM_ADMIN_OPTIONS } from './platformAssistantOptions';
import { OrgsProvider } from '../../contexts/orgs';
import OrgsContainer from './OrgsContainer';
import { GlobalUsersProvider } from '../../contexts/globalUsers';
import GlobalUsersContainer from './GlobalUsersContainer';
// import mockOrganizations from "./mockOrganizations";

const PlatformAdminOptionsContainer = styled.div`
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

const PlatformAdminOptions: FC<{}> = () => {
    const { accessToken } = useAuthState();
    const [organizations, setOrganizations] = useState([]);
    const [globalUsers, setGlobalUsers] = useState([]);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [globalUsersLoading, setGlobalUsersLoading] = useState(true);
    const [refreshTokens, setRefreshTokens] = useState([]);
    const [refreshTokensLoading, setRefreshTokensLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(PLATFORM_ADMIN_OPTIONS.ORGS);
    const [reloadOrgs, setReloadOrgs] = useState(0);
    const [reloadGlobalUsers, setReloadGlobalUsers] = useState(0);
    const [reloadRefreshTokens, setReloadRefreshTokens] = useState(0);

    const refreshOrgs = () => {
        setReloadOrgs(reloadOrgs + 1);
        setOrgsLoading(true);
    }

    const refreshGlobalUsers = () => {
        setReloadGlobalUsers(reloadGlobalUsers + 1);
        setGlobalUsersLoading(true);
    }

    const refreshRefreshTokens = () => {
        setReloadRefreshTokens(reloadRefreshTokens + 1);
        setRefreshTokensLoading(true);
    }

    useEffect(() => {
        const urlOrganizations = `https://${domainName}/admin_api/organizations`;
        const config = axiosAuth(accessToken);
        axios
            .get(urlOrganizations, config)
            .then((response) => {
                const organizations = response.data;
                setOrganizations(organizations);
                setOrgsLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });

        // const organizations = JSON.parse(mockOrganizations);
        // setOrganizations(organizations);
        // setOrgsLoading(false);

    }, [accessToken, reloadOrgs]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlGlobalUsers = `https://${domainName}/admin_api/application/global_users`;
        axios
            .get(urlGlobalUsers, config)
            .then((response) => {
                const globalUsers = response.data;
                globalUsers.map((user: { roleInPlatform: string; lastSeenAtAge: string, isGrafanaAdmin: boolean }) => {
                    user.roleInPlatform = user.isGrafanaAdmin ? "Admin" : "";
                    user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
                    return user;
                })
                setGlobalUsers(globalUsers);
                setGlobalUsersLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });

    }, [accessToken, reloadGlobalUsers]);

    useEffect(() => {
        const config = axiosAuth(accessToken);
        const urlRefreshTokens = `https://${domainName}/admin_api/auth/refresh_tokens`;
        axios
            .get(urlRefreshTokens, config)
            .then((response) => {
                const refreshTokens: IRefreshToken[] = response.data;
                refreshTokens.map(token => {
                    token.createdAtAge = elaspsedTimeFormat(token.createdAtAge);
                    token.updatedAtAge = elaspsedTimeFormat(token.updatedAtAge);
                    return token;
                })
                setRefreshTokens(refreshTokens as unknown as SetStateAction<never[]>);
                setRefreshTokensLoading(false);
            })
            .catch((error) => {
                console.log(error);
            });

    }, [accessToken, reloadRefreshTokens]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    return (
        <>
            <PlatformAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.ORGS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.ORGS)}>
                    Organizations
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.GLOBAL_USERS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.GLOBAL_USERS)}>
                    Global users
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.REFRESH_TOKENS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.REFRESH_TOKENS)}>
                    Refresh tokens
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.TOOLS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.TOOLS)}>
                    Tools
                </OptionContainer>
            </PlatformAdminOptionsContainer>
            <ContentContainer >
                <>
                    {(orgsLoading || globalUsersLoading || refreshTokensLoading) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.ORGS &&
                                <OrgsProvider>
                                    <OrgsContainer organizations={organizations} refreshOrgs={refreshOrgs} />
                                </OrgsProvider>
                            }
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.GLOBAL_USERS &&
                                <GlobalUsersProvider>
                                    <GlobalUsersContainer globalUsers={globalUsers} refreshGlobalUsers={refreshGlobalUsers} />
                                </GlobalUsersProvider>
                            }
                            {
                                optionToShow === "Refresh tokens" &&
                                <TableWithPagination
                                    dataTable={refreshTokens}
                                    columnsTable={Create_REFRESH_TOKENS_COLUMNS(refreshRefreshTokens)}
                                    componentName=""
                                />
                            }
                        </>
                    }
                    {optionToShow === "Tools" && <PlatformTools />}
                </>
            </ContentContainer>
        </>
    )
}

export default PlatformAdminOptions;
