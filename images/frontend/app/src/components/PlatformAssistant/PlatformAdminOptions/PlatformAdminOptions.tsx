import React, { FC, useEffect, useState, useCallback } from 'react'
import styled from "styled-components";
import { axiosAuth, getDomainName, getProtocol } from '../../../tools/tools';
import { useAuthState, useAuthDispatch } from '../../../contexts/authContext';
import TableWithPagination from '../Utils/TableWithPagination';
import Loader from "../../Tools/Loader";
import PlatformTools from './PlatformToolsOptions';
import { IRefreshToken, Create_REFRESH_TOKENS_COLUMNS } from '../TableColumns/refreshTokensColumns';
import elaspsedTimeFormat from '../../../tools/elapsedTimeFormat';
import { PLATFORM_ADMIN_OPTIONS } from '../Utils/platformAssistantOptions';
import { OrgsProvider } from '../../../contexts/orgsOptions';
import OrgsContainer from './OrgsContainer';
import { GlobalUsersProvider } from '../../../contexts/globalUsersOptions';
import GlobalUsersContainer from './GlobalUsersContainer';
import {
    usePlatformAssitantDispatch,
    useGlobalUsersTable,
    useOrganizationsTable,
    useRefreshTokensTable,
    setOrganizationsTable,
    setGlobalUsersTable,
    setRefreshTokensTable,
    useBuildingsTable,
    useFloorsTable,
    setBuildingsTable,
    setFloorsTable,
    useReloadGlobalUsersTable,
    setReloadGlobalUsersTable,
    useReloadBuildingsTable,
    useReloadFloorsTable,
    setReloadBuildingsTable,
    setReloadFloorsTable,
} from '../../../contexts/platformAssistantContext';
import { BuildingsProvider } from '../../../contexts/buildingsOptions';
import BuildingsContainer from './BuildingsContainer';
import { FloorsProvider } from '../../../contexts/floorsOptions';
import FloorsContainer from './FloorsContainer';
import { IGlobalUser } from '../TableColumns/globalUsersColumns';
import { getAxiosInstance } from '../../../tools/axiosIntance';
import axiosErrorHandler from '../../../tools/axiosErrorHandler';
import { IBuilding } from '../TableColumns/buildingsColumns';
import { IFloor } from '../TableColumns/floorsColumns';
import { AxiosResponse, AxiosError } from 'axios';

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
    height: calc(100vh - 220px);
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

const PlatformAdminOptions: FC<{}> = () => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const plaformAssistantDispatch = usePlatformAssitantDispatch();
    const organizationsTable = useOrganizationsTable();
    const buildingsTable = useBuildingsTable();
    const floorsTable = useFloorsTable();
    const globalUsersTable = useGlobalUsersTable();
    const refreshTokensTable = useRefreshTokensTable();
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [buildingsLoading, setBuildingsLoading] = useState(true);
    const [floorsLoading, setFloorsLoading] = useState(true);
    const [globalUsersLoading, setGlobalUsersLoading] = useState(true);
    const [refreshTokensLoading, setRefreshTokensLoading] = useState(true);
    const [optionToShow, setOptionToShow] = useState(PLATFORM_ADMIN_OPTIONS.BUILDINGS);
    const [reloadOrgs, setReloadOrgs] = useState(false);

    const reloadBuildingsTable = useReloadBuildingsTable();
    const reloadFloorsTable = useReloadFloorsTable();
    const reloadGlobalUsersTable = useReloadGlobalUsersTable();
    const [reloadRefreshTokens, setReloadRefreshTokens] = useState(false);

    const refreshOrgs = useCallback(() => {
        setReloadOrgs(true);
        setOrgsLoading(true);
        setTimeout(() => setReloadOrgs(false), 500);
    }, []);

    const refreshBuildings = useCallback(() => {
        setBuildingsLoading(true);
        const reloadBuildingsTable = true;
        setReloadBuildingsTable(plaformAssistantDispatch, { reloadBuildingsTable });
    }, [plaformAssistantDispatch]);

    const refreshFloors = useCallback(() => {
        setFloorsLoading(true);
        const reloadFloorsTable = true;
        setReloadFloorsTable(plaformAssistantDispatch, { reloadFloorsTable });
    }, [plaformAssistantDispatch]);

    const refreshGlobalUsers = useCallback(() => {
        setGlobalUsersLoading(true);
        const reloadGlobalUsersTable = true;
        setReloadGlobalUsersTable(plaformAssistantDispatch, { reloadGlobalUsersTable });
    }, [plaformAssistantDispatch]);

    const refreshRefreshTokens = useCallback(() => {
        setReloadRefreshTokens(true);
        setRefreshTokensLoading(true);
        setTimeout(() => setReloadRefreshTokens(false), 500);
    }, []);


    useEffect(() => {
        if (organizationsTable.length === 0 || reloadOrgs) {
            const urlOrganizations = `${protocol}://${domainName}/admin_api/organizations`;
            const config = axiosAuth(accessToken);
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlOrganizations, config)
                .then((response: AxiosResponse<any, any>) => {
                    const organizations = response.data;
                    setOrganizationsTable(plaformAssistantDispatch, { organizations });
                    setOrgsLoading(false);
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });

        } else {
            setOrgsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadOrgs,
        plaformAssistantDispatch,
        organizationsTable.length
    ]);


    useEffect(() => {
        if (buildingsTable.length === 0 || reloadBuildingsTable) {
            const urlBuildings = `${protocol}://${domainName}/admin_api/buildings`;
            const config = axiosAuth(accessToken);
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlBuildings, config)
                .then((response: AxiosResponse<any, any>) => {
                    const buildings = response.data;
                    buildings.map((building: IBuilding) => {
                        building.createdAtAge = elaspsedTimeFormat(building.createdAtAge);
                        building.updatedAtAge = elaspsedTimeFormat(building.updatedAtAge);
                        return building;
                    })
                    setBuildingsTable(plaformAssistantDispatch, { buildings });
                    setBuildingsLoading(false);
                    const reloadBuildingsTable = false;
                    setReloadBuildingsTable(plaformAssistantDispatch, { reloadBuildingsTable });
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });

        } else {
            setBuildingsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadBuildingsTable,
        plaformAssistantDispatch,
        buildingsTable.length
    ]);

    useEffect(() => {
        if (floorsTable.length === 0 || reloadFloorsTable) {
            const urlFloors = `${protocol}://${domainName}/admin_api/building_floors`;
            const config = axiosAuth(accessToken);
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlFloors, config)
                .then((response: AxiosResponse<any, any>) => {
                    const floors = response.data;
                    floors.map((floor: IFloor) => {
                        floor.createdAtAge = elaspsedTimeFormat(floor.createdAtAge);
                        floor.updatedAtAge = elaspsedTimeFormat(floor.updatedAtAge);
                        return floor;
                    })
                    setFloorsTable(plaformAssistantDispatch, { floors });
                    setFloorsLoading(false);
                    const reloadFloorsTable = false;
                    setReloadFloorsTable(plaformAssistantDispatch, { reloadFloorsTable });
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });

        } else {
            setFloorsLoading(false);
        }
    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadFloorsTable,
        plaformAssistantDispatch,
        floorsTable.length
    ]);

    useEffect(() => {
        if (globalUsersTable.length === 0 || reloadGlobalUsersTable) {
            const config = axiosAuth(accessToken);
            const urlGlobalUsers = `${protocol}://${domainName}/admin_api/application/global_users`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlGlobalUsers, config)
                .then((response: AxiosResponse<any, any>) => {
                    const globalUsers = response.data.filter((user: IGlobalUser) => user.login.slice(-9) !== "api_admin");
                    globalUsers.map((user: { roleInPlatform: string; lastSeenAtAge: string, isGrafanaAdmin: boolean }) => {
                        user.roleInPlatform = user.isGrafanaAdmin ? "Admin" : "";
                        user.lastSeenAtAge = elaspsedTimeFormat(user.lastSeenAtAge);
                        return user;
                    })
                    setGlobalUsersTable(plaformAssistantDispatch, { globalUsers });
                    setGlobalUsersLoading(false);
                    const reloadGlobalUsersTable = false;
                    setReloadGlobalUsersTable(plaformAssistantDispatch, { reloadGlobalUsersTable });
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
                });
        } else {
            setGlobalUsersLoading(false);
        }

    }, [
        accessToken,
        refreshToken,
        authDispatch,
        reloadGlobalUsersTable,
        plaformAssistantDispatch,
        globalUsersTable.length
    ]);

    useEffect(() => {
        if (refreshTokensTable.length === 0 || reloadRefreshTokens) {
            const config = axiosAuth(accessToken);
            const urlRefreshTokens = `${protocol}://${domainName}/admin_api/auth/refresh_tokens`;
            getAxiosInstance(refreshToken, authDispatch)
                .get(urlRefreshTokens, config)
                .then((response: AxiosResponse<any, any>) => {
                    const refreshTokens = response.data;
                    refreshTokens.map((token: IRefreshToken) => {
                        token.createdAtAge = elaspsedTimeFormat(token.createdAtAge);
                        token.updatedAtAge = elaspsedTimeFormat(token.updatedAtAge);
                        return token;
                    })
                    setRefreshTokensTable(plaformAssistantDispatch, { refreshTokens });
                    setRefreshTokensLoading(false);
                })
                .catch((error: AxiosError) => {
                    axiosErrorHandler(error, authDispatch);
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
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.BUILDINGS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.BUILDINGS)}>
                    Buildings
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === PLATFORM_ADMIN_OPTIONS.FLOORS} onClick={() => clickHandler(PLATFORM_ADMIN_OPTIONS.FLOORS)}>
                    Floors
                </OptionContainer>
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
                    {(orgsLoading || buildingsLoading || floorsLoading || globalUsersLoading || refreshTokensLoading) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.ORGS &&
                                <OrgsProvider>
                                    <OrgsContainer organizations={organizationsTable} refreshOrgs={refreshOrgs} />
                                </OrgsProvider>
                            }                          
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.BUILDINGS &&
                                <BuildingsProvider>
                                    <BuildingsContainer buildings={buildingsTable} refreshBuildings={refreshBuildings} />
                                </BuildingsProvider>
                            }
                            {optionToShow === PLATFORM_ADMIN_OPTIONS.FLOORS &&
                                <FloorsProvider>
                                    <FloorsContainer floors={floorsTable} refreshFloors={refreshFloors} />
                                </FloorsProvider>
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
