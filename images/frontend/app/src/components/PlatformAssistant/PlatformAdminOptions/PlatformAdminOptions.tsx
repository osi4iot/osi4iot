import { FC, useCallback } from 'react'
import styled from "styled-components";
import TableWithPagination from '../Utils/TableWithPagination';
import Loader from "../../Tools/Loader";
import PlatformTools from './PlatformToolsOptions';
import { Create_REFRESH_TOKENS_COLUMNS } from '../TableColumns/refreshTokensColumns';
import { PLATFORM_ADMIN_OPTIONS } from '../Utils/platformAssistantOptions';
import { OrgsProvider } from '../../../contexts/orgsOptions';
import { GlobalUsersProvider } from '../../../contexts/globalUsersOptions';
import GlobalUsersContainer from './GlobalUsersContainer';
import { BuildingsProvider } from '../../../contexts/buildingsOptions';
import BuildingsContainer from './BuildingsContainer';
import { FloorsProvider } from '../../../contexts/floorsOptions';
import FloorsContainer from './FloorsContainer';
import { reloadTable, usePersistentState, useTable, useTablesPending } from '../../../state';
import OrgsContainer from './OrgContainer';
import { Column } from '../Utils/platformTable';
import SkillsContainer from '../Utils/SkillsContainer';

const ContentContainer = styled.div`
    flex: 1;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    background-color: #202226;
    display: flex;
	flex-direction: column;
    justify-content: flex-start;
	align-items: center;
    overflow: auto;

    /* width */
    &::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }

    /* Track */
    &::-webkit-scrollbar-track {
        background: #202226;
        border-radius: 5px;
    }
    
    /* Handle */
    &::-webkit-scrollbar-thumb {
        background: #2c3235; 
        border-radius: 5px;
    }

    /* Handle on hover */
    &::-webkit-scrollbar-thumb:hover {
        background-color: #343840;
    }

    &::-webkit-scrollbar-corner {
        /* background-color: #0c0d0f; */
        background: #202226;
    }

`;

const PlatformAdminOptions: FC<{}> = () => {
    // en esta capa (LayerScope "admin") los edificios y las plantas son todos los de la plataforma
    const organizationsTable = useTable("organizations");
    const buildingsTable = useTable("buildings");
    const floorsTable = useTable("floors");
    const globalUsersTable = useTable("globalUsers");
    const refreshTokensTable = useTable("refreshTokens");
    const loading = useTablesPending(["organizations", "buildings", "floors", "globalUsers", "refreshTokens"]);
    // sección abierta: la elige el menú lateral y se conserva al cambiar de capa
    const [optionToShow] = usePersistentState("admin.optionToShow", PLATFORM_ADMIN_OPTIONS.BUILDINGS);

    const refreshOrgs = useCallback(() => reloadTable("organizations"), []);
    const refreshBuildings = useCallback(() => reloadTable("buildings"), []);
    const refreshFloors = useCallback(() => reloadTable("floors"), []);
    const refreshGlobalUsers = useCallback(() => reloadTable("globalUsers"), []);
    const refreshRefreshTokens = useCallback(() => reloadTable("refreshTokens"), []);


    return (
        <>
            <ContentContainer >
                <>
                    {loading ?
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
                                    columnsTable={Create_REFRESH_TOKENS_COLUMNS(refreshRefreshTokens) as Column<any>[]}
                                    reloadTable={refreshRefreshTokens}
                                    componentName=""
                                />
                            }
                        </>
                    }
                    {optionToShow === "Tools" && <PlatformTools />}
                    {optionToShow === PLATFORM_ADMIN_OPTIONS.SKILLS && <SkillsContainer scope="platform" />}
                </>
            </ContentContainer>
        </>
    )
}

export default PlatformAdminOptions;