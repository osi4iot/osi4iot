import React, { FC, SetStateAction, useEffect, useState } from 'react'
import { Redirect } from "react-router-dom";
import styled from "styled-components";
import { axiosAuth, getDomainName } from '../tools/tools';
import axios from 'axios';
import { useIsPlatformAdmin } from '../contexts/platformAssistantContext';
import { useAuthState } from '../contexts/authContext';
import { GLOBAL_USERS_COLUMNS } from "./TableColumns/globalUsersColumns";
import { ORGANIZATIONS_COLUMNS } from './TableColumns/organizationsColumns';
import TableWithPagination from './TableWithPagination';
import Loader from "./Loader";
import PlatformTools from './PlatformToolsOptions';
import mockOrganizations from "./mockOrganizations";
import { IRefreshToken, REFRESH_TOKENS_COLUMNS } from './TableColumns/refreshTokensColumns';
import elaspsedTimeFormat from '../tools/elapsedTimeFormat';

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
    const isPlatformAdmin = useIsPlatformAdmin();
    const { accessToken } = useAuthState();
    const [optionToShow, setOptionToShow] = useState("Organizations");
    const [organizations, setOrganizations] = useState([]);
    const [globalUsers, setGlobalUsers] = useState([]);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [globalUsersLoading, setGlobalUsersLoading] = useState(true);
    const [refreshTokens, setRefreshTokens] = useState([]);
    const [refreshTokensLoading, setRefreshTokensLoading] = useState(true);

    useEffect(() => {
        const urlOrganizations = `https://${domainName}/admin_api/organizations`;
        const config = axiosAuth(accessToken);
        // axios
        //     .get(urlOrganizations, config)
        //     .then((response) => {
        //         const organizations = response.data;
        //         setOrganizations(organizations);
        //         setOrgsLoading(false);
        //     })
        //     .catch((error) => {
        //         console.log(error);
        //     });

        const organizations = JSON.parse(mockOrganizations);
        setOrganizations(organizations);
        setOrgsLoading(false);

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
        
    }, [accessToken]);

    const clickHandler = (optionToShow: string) => {
        setOptionToShow(optionToShow);
    }

    if (!isPlatformAdmin) {
        <Redirect to="/401/platform" />
    }

    return (
        <>
            <PlatformAdminOptionsContainer>
                <OptionContainer isOptionActive={optionToShow === "Organizations"} onClick={() => clickHandler("Organizations")}>
                    Organizations
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Global users"} onClick={() => clickHandler("Global users")}>
                    Global users
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Refresh tokens"} onClick={() => clickHandler("Refresh tokens")}>
                    Refresh tokens
                </OptionContainer>
                <OptionContainer isOptionActive={optionToShow === "Tools"} onClick={() => clickHandler("Tools")}>
                    Tools
                </OptionContainer>
            </PlatformAdminOptionsContainer>
            <ContentContainer >
                <>
                    {(orgsLoading || globalUsersLoading || refreshTokensLoading) ?
                        <Loader />
                        :
                        <>
                            {optionToShow === "Organizations" && <TableWithPagination dataTable={organizations} columnsTable={ORGANIZATIONS_COLUMNS} componentName="org" />}
                            {optionToShow === "Global users" && <TableWithPagination dataTable={globalUsers} columnsTable={GLOBAL_USERS_COLUMNS} componentName="global user" />}
                            {optionToShow === "Refresh tokens" && <TableWithPagination dataTable={refreshTokens} columnsTable={REFRESH_TOKENS_COLUMNS} componentName="" />}
                        </>
                    }
                    {optionToShow === "Tools" && <PlatformTools />}
                </>
            </ContentContainer>
        </>
    )
}

export default PlatformAdminOptions;
