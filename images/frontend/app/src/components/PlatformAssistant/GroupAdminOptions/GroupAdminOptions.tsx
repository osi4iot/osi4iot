import { FC, useCallback, useMemo } from "react";
import styled from "styled-components";
import Loader from "../../Tools/Loader";
import { GROUP_ADMIN_OPTIONS } from "../Utils/platformAssistantOptions";
import GroupMembersContainer from "./GroupMembersContainer";
import { GroupMembersProvider } from "../../../contexts/groupMembersOptions";
import { GroupsManagedProvider } from "../../../contexts/groupsManagedOptions";
import GroupsManagedContainer from "./GroupsManagedContainer";
import { TopicsProvider } from "../../../contexts/topicsOptions";
import TopicsContainer from "./TopicsContainer";
import { DigitalTwinsProvider } from "../../../contexts/digitalTwinsOptions";
import DigitalTwinsContainer from "./DigitalTwinsContainer";
import { MeasurementsProvider } from "../../../contexts/measurementsOptions";
import MeasurementsContainer from "./MeasurementsContainer";
import { filterBuildings } from "../../../tools/filterBuildings";
import { filterFloors } from "../../../tools/filterFloors";
import { DASHBOARD_COLUMNS } from "../TableColumns/dashboardsColumns";
import TableWithPagination from "../Utils/TableWithPagination";
import { MlModelsProvider } from "../../../contexts/mlModelsOptions";
import MlModelsContainer from "./MlModelsContainer";
import { AssetsProvider } from "../../../contexts/assetsOptions";
import AssetsContainer from "./AssetsContainer";
import { SensorsProvider } from "../../../contexts/sensorsOptions";
import SensorsContainer from "./SensorsContainer";
import { AssetS3FolderProvider } from "../../../contexts/assetS3FolderOptions";
import AssetS3FolderContainer from "./AssetS3FolderContainer";
import { Column } from '../Utils/platformTable';
import KnowledgeContainer from "./KnowledgeContainer";
import { reloadTable, TableName, usePersistentState, useTable, useTablesPending } from "../../../state";

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

// Tablas que necesita la capa: se piden al entrar (las que ya están en caché se muestran al momento)
const GROUP_ADMIN_TABLES: TableName[] = [
    "buildings",
    "floors",
    "orgsOfGroupsManaged",
    "groupsManaged",
    "assetTypes",
    "assets",
    "assetTopics",
    "assetS3Folders",
    "sensorTypes",
    "sensors",
    "groupMembers",
    "selectOrgUsers",
    "topics",
    "dashboards",
    "digitalTwins",
    "mlModels",
];

const GroupAdminOptions: FC<{}> = () => {
    // sección abierta: la elige el menú lateral y se conserva al cambiar de capa
    const [optionToShow] = usePersistentState("group.optionToShow", GROUP_ADMIN_OPTIONS.GROUPS_MANAGED);
    const buildingsTable = useTable("buildings");
    const floorsTable = useTable("floors");
    const orgsOfGroupManagedTable = useTable("orgsOfGroupsManaged");
    const groupsManagedTable = useTable("groupsManaged");
    const assetTypesTable = useTable("assetTypes");
    const assetsTable = useTable("assets");
    const assetS3FoldersTable = useTable("assetS3Folders");
    const sensorsTable = useTable("sensors");
    const groupMembersTable = useTable("groupMembers");
    const topicsTable = useTable("topics");
    const dashboardsTable = useTable("dashboards");
    const digitalTwinsTable = useTable("digitalTwins");
    const mlModelsTable = useTable("mlModels");
    const loading = useTablesPending(GROUP_ADMIN_TABLES);
    const buildingsFiltered = useMemo(() => filterBuildings(buildingsTable), [buildingsTable]);
    const floorsFiltered = useMemo(() => filterFloors(floorsTable), [floorsTable]);

    const refreshGroupsManaged = useCallback(() => reloadTable("groupsManaged"), []);
    const refreshAssets = useCallback(() => reloadTable("assets"), []);
    const refreshAssetS3Folders = useCallback(() => reloadTable("assetS3Folders"), []);
    const refreshSensors = useCallback(() => reloadTable("sensors"), []);
    const refreshGroupMembers = useCallback(() => reloadTable("groupMembers"), []);
    const refreshTopics = useCallback(() => reloadTable("topics"), []);
    const refreshDashboards = useCallback(() => reloadTable("dashboards"), []);
    const refreshDigitalTwins = useCallback(() => reloadTable("digitalTwins"), []);
    const refreshMlModels = useCallback(() => reloadTable("mlModels"), []);
    const refreshBuildings = useCallback(() => reloadTable("buildings"), []);
    const refreshFloors = useCallback(() => reloadTable("floors"), []);


    return (
        <>
            <ContentContainer>
                {loading ? (
                    <Loader />
                ) : (
                    <>
                        {optionToShow === GROUP_ADMIN_OPTIONS.GROUPS_MANAGED && (
                            <GroupsManagedProvider>
                                <GroupsManagedContainer
                                    orgsOfGroupManaged={orgsOfGroupManagedTable}
                                    groupsManaged={groupsManagedTable}
                                    buildingsFiltered={buildingsFiltered}
                                    floorsFiltered={floorsFiltered}
                                    refreshGroupsManaged={refreshGroupsManaged}
                                    refreshGroupMembers={refreshGroupMembers}
                                    assetTypes={assetTypesTable}
                                    assets={assetsTable}
                                    refreshAssets={refreshAssets}
                                    refreshGroups={refreshGroupsManaged}
                                    refreshBuildings={refreshBuildings}
                                    refreshFloors={refreshFloors}
                                />
                            </GroupsManagedProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.GROUP_MEMBERS && (
                            <GroupMembersProvider>
                                <GroupMembersContainer
                                    groupMembers={groupMembersTable}
                                    refreshGroupMembers={refreshGroupMembers}
                                />
                            </GroupMembersProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.ASSETS && (
                            <AssetsProvider>
                                <AssetsContainer
                                    orgsOfGroupManaged={orgsOfGroupManagedTable}
                                    groupsManaged={groupsManagedTable}
                                    buildingsFiltered={buildingsFiltered}
                                    floorsFiltered={floorsFiltered}
                                    assetTypes={assetTypesTable}
                                    assets={assetsTable}
                                    refreshAssets={refreshAssets}
                                    refreshGroups={refreshGroupsManaged}
                                    refreshBuildings={refreshBuildings}
                                    refreshFloors={refreshFloors}
                                />
                            </AssetsProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.SENSORS && (
                            <SensorsProvider>
                                <SensorsContainer sensors={sensorsTable} refreshSensors={refreshSensors} />
                            </SensorsProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.TOPICS && (
                            <TopicsProvider>
                                <TopicsContainer
                                    orgsOfGroupManaged={orgsOfGroupManagedTable}
                                    groupsManaged={groupsManagedTable}
                                    topics={topicsTable}
                                    refreshTopics={refreshTopics}
                                />
                            </TopicsProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.MEASUREMENTS && (
                            <MeasurementsProvider>
                                <MeasurementsContainer topics={topicsTable} sensors={sensorsTable} />
                            </MeasurementsProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.S3_STORAGE && (
                            <AssetS3FolderProvider>
                                <AssetS3FolderContainer
                                    assetS3Folders={assetS3FoldersTable}
                                    refreshAssetS3Folders={refreshAssetS3Folders}
                                />
                            </AssetS3FolderProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.DASHBOARDS && (
                            <TableWithPagination
                                dataTable={dashboardsTable}
                                columnsTable={DASHBOARD_COLUMNS as Column<any>[]}
                                reloadTable={refreshDashboards}
                                componentName=""
                            />
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.DIGITAL_TWINS && (
                            <DigitalTwinsProvider>
                                <DigitalTwinsContainer
                                    digitalTwins={digitalTwinsTable}
                                    refreshDigitalTwins={refreshDigitalTwins}
                                />
                            </DigitalTwinsProvider>
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.KNOWLEDGE && (
                            <KnowledgeContainer groupsManaged={groupsManagedTable} />
                        )}
                        {optionToShow === GROUP_ADMIN_OPTIONS.ML_MODELS && (
                            <MlModelsProvider>
                                <MlModelsContainer
                                    orgsOfGroupManaged={orgsOfGroupManagedTable}
                                    groupsManaged={groupsManagedTable}
                                    mlModels={mlModelsTable}
                                    refreshMlModels={refreshMlModels}
                                />
                            </MlModelsProvider>
                        )}
                    </>
                )}
            </ContentContainer>
        </>
    );
};

export default GroupAdminOptions;
