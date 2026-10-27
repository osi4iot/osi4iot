import { FC, useCallback, useMemo } from 'react'
import styled from "styled-components";
import Loader from "../../Tools/Loader";
import { ORG_ADMIN_OPTIONS } from '../Utils/platformAssistantOptions';
import { OrgUsersProvider } from '../../../contexts/orgUsersOptions';
import OrgUsersContainer from './OrgUsersContainer';
import { GroupsProvider } from '../../../contexts/groupsOptions';
import GroupsContainer from './GroupsContainer';
import { OrgsManagedProvider } from '../../../contexts/orgsManagedOptions';
import OrgsManagedContainer from './OrgsManagedContainer';
import { filterBuildings } from '../../../tools/filterBuildings';
import { filterFloors } from '../../../tools/filterFloors';
import { AssetTypesProvider } from '../../../contexts/assetTypesOptions';
import AssetTypesContainer from './AssetTypesContainer';
import { SensorTypesProvider } from '../../../contexts/sensorTypesOptions';
import SensorTypesContainer from './SensorTypesContainer';
import { reloadTable, reloadTables, usePersistentState, useTable, useTablesPending } from '../../../state';


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

const OrganizationAdminOptions: FC<{}> = () => {
    const buildingsTable = useTable("buildings");
    const floorsTable = useTable("floors");
    const orgsManagedTable = useTable("orgsManaged");
    const orgUsersTable = useTable("orgUsers");
    const groupsTable = useTable("groups");
    const assetTypesTable = useTable("assetTypes");
    const sensorTypesTable = useTable("sensorTypes");
    const loading = useTablesPending([
        "buildings",
        "floors",
        "orgsManaged",
        "orgUsers",
        "groups",
        "globalUsers",
        "assetTypes",
        "sensorTypes",
    ]);
    // sección abierta: la elige el menú lateral y se conserva al cambiar de capa
    const [optionToShow] = usePersistentState("org.optionToShow", ORG_ADMIN_OPTIONS.ORGS_MANAGED);
    const buildingsFiltered = useMemo(() => filterBuildings(buildingsTable), [buildingsTable]);
    const floorsFiltered = useMemo(() => filterFloors(floorsTable), [floorsTable]);

    const refreshOrgsManaged = useCallback(() => reloadTable("orgsManaged"), []);
    const refreshOrgUsers = useCallback(() => reloadTables(["orgUsers", "globalUsers"]), []);
    const refreshGroups = useCallback(() => reloadTable("groups"), []);
    const refreshSensorTypes = useCallback(() => reloadTable("sensorTypes"), []);
    const refreshAssetTypes = useCallback(() => reloadTable("assetTypes"), []);
    const refreshBuildings = useCallback(() => reloadTable("buildings"), []);
    const refreshFloors = useCallback(() => reloadTable("floors"), []);



    return (
        <>
            <ContentContainer >
                {
loading ?
                        <Loader />
                        :
                        <>
                            {optionToShow === ORG_ADMIN_OPTIONS.ORGS_MANAGED &&
                                <OrgsManagedProvider>
                                    <OrgsManagedContainer orgsManaged={orgsManagedTable} refreshOrgsManaged={refreshOrgsManaged} refreshOrgUsers={refreshOrgUsers} />
                                </OrgsManagedProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.ORG_USERS &&
                                <OrgUsersProvider>
                                    <OrgUsersContainer orgUsers={orgUsersTable} refreshOrgUsers={refreshOrgUsers} />
                                </OrgUsersProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.GROUPS &&
                                <GroupsProvider>
                                    <GroupsContainer
                                        buildingsFiltered={buildingsFiltered}
                                        floorsFiltered={floorsFiltered}
                                        groups={groupsTable}
                                        refreshGroups={refreshGroups}
                                        refreshBuildings={refreshBuildings}
                                        refreshFloors={refreshFloors}
                                    />
                                </GroupsProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.SENSOR_TYPES &&
                                <SensorTypesProvider>
                                    <SensorTypesContainer
                                        sensorTypes={sensorTypesTable}
                                        refreshSensorTypes={refreshSensorTypes}
                                    />
                                </SensorTypesProvider>
                            }
                            {optionToShow === ORG_ADMIN_OPTIONS.ASSET_TYPES &&
                                <AssetTypesProvider>
                                    <AssetTypesContainer
                                        assetTypes={assetTypesTable}
                                        refreshAssetTypes={refreshAssetTypes}
                                    />
                                </AssetTypesProvider>
                            }
                        </>
                }
            </ContentContainer>
        </>
    )
}

export default OrganizationAdminOptions;

