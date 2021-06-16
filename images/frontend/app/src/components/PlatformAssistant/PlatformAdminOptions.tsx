import React, { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName, axiosInstance } from '../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../contexts/authContext';
import TableWithPagination from './TableWithPagination';
import Loader from "../Tools/Loader";
import PlatformTools from './PlatformToolsOptions';
import { IRefreshToken, Create_REFRESH_TOKENS_COLUMNS } from './TableColumns/refreshTokensColumns';
import elaspsedTimeFormat from '../../tools/elapsedTimeFormat';
import { PLATFORM_ADMIN_OPTIONS } from './platformAssistantOptions';
import { OrgsProvider } from '../../contexts/orgsOptions';
import OrgsContainer from './OrgsContainer';
import { GlobalUsersProvider } from '../../contexts/globalUsersOptions';
import GlobalUsersContainer from './GlobalUsersContainer';
import {
    usePlatformAssitantDispatch,
    useGlobalUsersTable,
    useOrganizationsTable,
    useRefreshTokensTable,
    setOrganizationsTable,
    setGlobalUsersTable,
    setRefreshTokensTable,

} from '../../contexts/platformAssistantContext';
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

const PlatformAdminOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const organizationsTable = useOrganizationsTable();
    const globalUsersTable = useGlobalUsersTable();
    const refreshTokensTable = useRefreshTokensTable();
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [globalUsersLoading, setGlobalUsersLoading] = useState(true);
    const [refreshTokensLoading, setRefreshTokensLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(PLATFORM_ADMIN_OPTIONS.ORGS);
    const [reloadOrgs, setReloadOrgs] = useState(false);
    const [reloadGlobalUsers, setReloadGlobalUsers] = useState(false);
    const [reloadRefreshTokens, setReloadRefreshTokens] = useState(false);


    const refreshOrgs = useCallback(() => {
        setReloadOrgs(true);
        setOrgsLoading(true);
        setTimeout(() => setReloadOrgs(false), 500);
    }, []);

    const refreshGlobalUsers = useCallback(() => {
        setReloadGlobalUsers(true);
        setGlobalUsersLoading(true);
        setTimeout(() => setReloadGlobalUsers(false), 500);
    }, []);


    const refreshRefreshTokens = useCallback(() => {
        setReloadRefreshTokens(true);
        setRefreshTokensLoading(true);
        setTimeout(() => setReloadRefreshTokens(false), 500);
    }, []);
    

    useEffect(() => {
        if (organizationsTable.length === 0 || reloadOrgs) {
            const urlOrganizations = `https://${domainName}/admin_api/organizations`;
            const config = axiosAuth(accessToken);
            axiosInstance(refreshToken, authDispatch)
                .get(urlOrganizations, config)
                .then((response) => {
                    const organizations = response.data;
                    // const organizations = JSON.parse(mockOrganizations);
                    setOrganizationsTable(plaformAssistantDispatch, { organizations });
                    setOrgsLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });

        } else {
            setOrgsLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, reloadOrgs, plaformAssistantDispatch, organizationsTable.length]);

    useEffect(() => {
        if (globalUsersTable.length === 0 || reloadGlobalUsers) {
            const config = axiosAuth(accessToken);
            const urlGlobalUsers = `https://${domainName}/admin_api/application/global_users`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlGlobalUsers, config)
                .then((response) => {
                    const globalUsers = response.data;
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

    }, [accessToken, refreshToken, authDispatch, reloadGlobalUsers, plaformAssistantDispatch, globalUsersTable.length]);

    useEffect(() => {
        if (refreshTokensTable.length === 0 || reloadRefreshTokens) {
            const config = axiosAuth(accessToken);
            const urlRefreshTokens = `https://${domainName}/admin_api/auth/refresh_tokens`;
            axiosInstance(refreshToken, authDispatch)
                .get(urlRefreshTokens, config)
                .then((response) => {
                    const refreshTokens = response.data;
                    refreshTokens.map((token: IRefreshToken) => {
                        token.createdAtAge = elaspsedTimeFormat(token.createdAtAge);
                        token.updatedAtAge = elaspsedTimeFormat(token.updatedAtAge);
                        return token;
                    })
                    setRefreshTokensTable(plaformAssistantDispatch, { refreshTokens });
                    setRefreshTokensLoading(false);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setRefreshTokensLoading(false);
        }
    }, [accessToken, refreshToken, authDispatch, reloadRefreshTokens, plaformAssistantDispatch, refreshTokensTable.length]);

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
                                    <OrgsContainer organizations={organizationsTable} refreshOrgs={refreshOrgs} />
                                </OrgsProvider>
                            }
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.GLOBAL_USERS &&
                                <GlobalUsersProvider>
                                    <GlobalUsersContainer globalUsers={globalUsersTable} refreshGlobalUsers={refreshGlobalUsers} />
                                </GlobalUsersProvider>
                            }
                            {
                                optionToShow === "Refresh tokens" &&
                                <TableWithPagination
                                    dataTable={refreshTokensTable}
                                    columnsTable={Create_REFRESH_TOKENS_COLUMNS(refreshRefreshTokens)}
                                    reloadTable={refreshRefreshTokens}
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
