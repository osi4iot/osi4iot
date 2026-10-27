import { FC, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import styled from "styled-components";
import { PLATFORM_ASSISTANT_HOME_OPTIONS } from "../Utils/platformAssistantOptions";
import Tutorial from "./Tutorial";
import GeolocationContainer, { IDigitalTwinState, ISensorState } from "../Geolocation/GeolocationContainer";
import { IGroupManaged } from "../TableColumns/groupsManagedColumns";
import { IDigitalTwin } from "../TableColumns/digitalTwinsColumns";
import { IBuilding } from "../TableColumns/buildingsColumns";
import { IFloor } from "../TableColumns/floorsColumns";
import { filterBuildings } from "../../../tools/filterBuildings";
import { filterFloors } from "../../../tools/filterFloors";
import { IOrgOfGroupsManaged } from "../TableColumns/orgsOfGroupsManagedColumns";
import DigitalTwin3DViewer from "../DigitalTwin3DViewer/Main/DigitalTwin3DViewer";
import { toast } from "react-toastify";
import { IDigitalTwinGltfData } from "../DigitalTwin3DViewer/ViewerTools/ViewerUtils";
import SceneLoader from "../../Tools/SceneLoader";
import { IAsset } from "../TableColumns/assetsColumns";
import { ISensor } from "../TableColumns/sensorsColumns";
import { IAssetType } from "../TableColumns/assetTypesColumns";
import fetchFemResFileCode from "../../../webWorkers/fetchFemResFileCode";
import HomeOptionsLoader from "../../Tools/HomeOptionsLoader";
import IAssetS3Folder from "../TableColumns/assetS3FolderColumns";
import WebGLErrorBoundary from "./WebGLErrorBoundary";
import { reloadTable, TableName, usePersistentState, useTable, useTableQuery, useTablesPending } from "../../../state";

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

const findAssetsWithMarker = (assetTypes: IAssetType[], assets: IAsset[]) => {
    const assetTypesWithMarker = assetTypes.filter(
        (item) => item.geolocationMode === "dynamic" && item.markerSvgString !== "",
    );
    const assetTypesIdArray = assetTypesWithMarker.map((item) => item.id);
    const assetsWithMarker = assets.filter((asset) => assetTypesIdArray.includes(asset.assetTypeId));
    return assetsWithMarker;
};

const filterAssetWithMarker = (
    assetsWithMarker: IAsset[],
    buildings: IBuilding[],
    orgsOfGroupsManagedTable: IOrgOfGroupsManaged[],
) => {
    const assetsWithMarkerFiltered = assetsWithMarker.filter((asset) => {
        const assetOrg = orgsOfGroupsManagedTable.filter((org) => org.id === asset.orgId)[0];
        const assetBuilding = buildings.filter((building) => building.id === assetOrg.buildingId)[0];
        const assetBuildingOuterBounds = assetBuilding.outerBounds;
        if (
            asset.latitude < assetBuildingOuterBounds[0][0] ||
            asset.latitude > assetBuildingOuterBounds[1][0] ||
            asset.longitude < assetBuildingOuterBounds[0][1] ||
            asset.longitude > assetBuildingOuterBounds[1][1]
        )
            return true;
        else return false;
    });
    return assetsWithMarkerFiltered;
};

const findBounds = (buildings: IBuilding[], assetsWithMarker: IAsset[]) => {
    let outerBounds: number[][] = [
        [35.55010533588552, -10.56884765625],
        [44.134913443750726, 1.42822265625],
    ];
    let maxLongitude = -180;
    let minLongitude = 180;
    let maxLatitude = -90;
    let minLatitude = 90;
    if (buildings.length !== 0) {
        const buildingsOuterBounds = buildings.map((building) => building.outerBounds);
        buildingsOuterBounds.forEach((buildingOuterBounds) => {
            if (buildingOuterBounds[1][1] > maxLongitude) maxLongitude = buildingOuterBounds[1][1];
            if (buildingOuterBounds[0][1] < minLongitude) minLongitude = buildingOuterBounds[0][1];
            if (buildingOuterBounds[1][0] > maxLatitude) maxLatitude = buildingOuterBounds[1][0];
            if (buildingOuterBounds[0][0] < minLatitude) minLatitude = buildingOuterBounds[0][0];
        });

        if (assetsWithMarker.length !== 0) {
            assetsWithMarker.forEach((asset) => {
                if (asset.longitude > maxLongitude) maxLongitude = asset.longitude;
                if (asset.longitude < minLongitude) minLongitude = asset.longitude;
                if (asset.latitude > maxLatitude) maxLatitude = asset.latitude;
                if (asset.latitude < minLatitude) minLatitude = asset.latitude;
            });
        }
        outerBounds = [
            [minLatitude, minLongitude],
            [maxLatitude, maxLongitude],
        ];
    } else {
        let minMapLatitude = 35.55010533588552;
        let maxMapLatitude = 44.134913443750726;
        let minMapLongitude = -10.56884765625;
        let maxMapLongitude = 1.42822265625;
        if (window._env_.MIN_LONGITUDE) {
            minMapLongitude = parseFloat(window._env_.MIN_LONGITUDE);
        }
        if (window._env_.MAX_LONGITUDE) {
            maxMapLongitude = parseFloat(window._env_.MAX_LONGITUDE);
        }
        if (window._env_.MIN_LATITUDE) {
            minMapLatitude = parseFloat(window._env_.MIN_LATITUDE);
        }
        if (window._env_.MAX_LATITUDE) {
            maxMapLatitude = parseFloat(window._env_.MAX_LATITUDE);
        }
        outerBounds = [
            [minMapLatitude, minMapLongitude],
            [maxMapLatitude, maxMapLongitude],
        ];
    }

    return outerBounds;
};

// Tablas de la capa principal (se piden al entrar; las que ya están en caché se muestran al momento)
const HOME_TABLES: TableName[] = [
    "buildings",
    "floors",
    "orgsOfGroupsManaged",
    "groupsManaged",
    "assetTypes",
    "assets",
    "sensorTypes",
    "sensors",
    "digitalTwins",
    "mlModels",
    "assetS3Folders",
];

// Un único worker para descargar resultados FEM (antes se creaba uno nuevo cada vez que se montaba la capa)
let fetchFemResFileWorkerSingleton: Worker | null = null;
const getFetchFemResFileWorker = () => {
    if (!fetchFemResFileWorkerSingleton) fetchFemResFileWorkerSingleton = new Worker(fetchFemResFileCode);
    return fetchFemResFileWorkerSingleton;
};

// Aviso de dashboards inexistentes una sola vez por cada carga de los gemelos digitales
let lastDigitalTwinsWarningAt = 0;

const sameBounds = (a: number[][], b: number[][]) => JSON.stringify(a) === JSON.stringify(b);

const PlatformAssistantHomeOptions: FC<{}> = () => {
    // ---- datos del servidor (TanStack Query, compartidos con el resto de capas)
    const buildingsTable = useTable("buildings");
    const floorsTable = useTable("floors");
    const orgsOfGroupsManagedTable = useTable("orgsOfGroupsManaged");
    const groupsManagedTable = useTable("groupsManaged");
    const assetTypesTable = useTable("assetTypes");
    const assetsTable = useTable("assets");
    const sensorTypesTable = useTable("sensorTypes");
    const sensorsTable = useTable("sensors");
    const digitalTwinsQuery = useTableQuery("digitalTwins");
    const digitalTwinsTable = useTable("digitalTwins");
    const assetS3FoldersTable = useTable("assetS3Folders");
    const tablesPending = useTablesPending(HOME_TABLES);

    const buildingsFiltered = useMemo(() => filterBuildings(buildingsTable), [buildingsTable]);
    const floorsFiltered = useMemo(() => filterFloors(floorsTable), [floorsTable]);

    // Activos con marcador en el mapa: su última geolocalización se pide solo si hay activos de ese tipo
    const assetsWithMarkerCandidates = useMemo(
        () => findAssetsWithMarker(assetTypesTable, assetsTable),
        [assetTypesTable, assetsTable],
    );
    const lastGeolocationsEnabled =
        assetsWithMarkerCandidates.length !== 0 && buildingsFiltered.length !== 0 && orgsOfGroupsManagedTable.length !== 0;
    const lastGeolocationsQuery = useTableQuery("lastGeolocations", { enabled: lastGeolocationsEnabled });
    const assetsWithMarker = useMemo(() => {
        if (!lastGeolocationsEnabled || !lastGeolocationsQuery.data) return [] as IAsset[];
        const lastGeolocationMeasurements = lastGeolocationsQuery.data;
        const positioned = assetsWithMarkerCandidates.map((asset) => {
            const lastGeolocation = lastGeolocationMeasurements.find((item) => item.assetUid === asset.assetUid);
            return lastGeolocation
                ? { ...asset, longitude: lastGeolocation.longitude, latitude: lastGeolocation.latitude }
                : { ...asset };
        });
        return filterAssetWithMarker(positioned, buildingsFiltered, orgsOfGroupsManagedTable);
    }, [lastGeolocationsEnabled, lastGeolocationsQuery.data, assetsWithMarkerCandidates, buildingsFiltered, orgsOfGroupsManagedTable]);
    const loading = tablesPending || (lastGeolocationsQuery.isPending && lastGeolocationsQuery.fetchStatus !== "idle");

    // ---- estado de la interfaz (Zustand): se conserva al ir a otra capa y volver
    const [optionToShow, setOptionToShow] = usePersistentState("home.optionToShow", PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);
    const [digitalTwinGltfData, setDigitalTwinGltfData] = usePersistentState<IDigitalTwinGltfData | null>(
        "home.digitalTwinGltfData",
        null,
    );
    const isDigitalTwinViewerOpen = optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS && !!digitalTwinGltfData;
    const computedOuterBounds = useMemo(() => findBounds(buildingsFiltered, assetsWithMarker), [buildingsFiltered, assetsWithMarker]);
    const [outerBounds, setOuterBounds] = usePersistentState("home.outerBounds", computedOuterBounds);
    const [initialOuterBounds, setInitialOuterBounds] = usePersistentState("home.initialOuterBounds", computedOuterBounds);
    const [buildingSelected, setBuildingSelected] = usePersistentState<IBuilding | null>("home.buildingSelected", null);
    const [floorSelected, setFloorSelected] = usePersistentState<IFloor | null>("home.floorSelected", null);
    const [orgSelected, setOrgSelected] = usePersistentState<IOrgOfGroupsManaged | null>("home.orgSelected", null);
    const [groupSelected, setGroupSelected] = usePersistentState<IGroupManaged | null>("home.groupSelected", null);
    const [assetSelected, setAssetSelected] = usePersistentState<IAsset | null>("home.assetSelected", null);
    const [sensorSelected, setSensorSelected] = usePersistentState<ISensor | null>("home.sensorSelected", null);
    const [digitalTwinSelected, setDigitalTwinSelected] = usePersistentState<IDigitalTwin | null>(
        "home.digitalTwinSelected",
        null,
    );
    const [assetS3Folders, setAssetS3Folders] = usePersistentState<IAssetS3Folder[]>("home.assetS3Folders", []);
    const [digitalTwinsState, setDigitalTwinsState] = usePersistentState<IDigitalTwinState[]>("home.digitalTwinsState", []);
    const [sensorsState, setSensorsState] = usePersistentState<ISensorState[]>("home.sensorsState", []);
    const [assetMarkerSelected, setAssetMarkerSelected] = usePersistentState("home.assetMarkerSelected", false);
    const [assetWithCameraSelected, setAssetWithCameraSelected] = usePersistentState("home.assetWithCameraSelected", false);
    const [sensorWithCameraSelected, setSensorWithCameraSelected] = usePersistentState("home.sensorWithCameraSelected", false);
    // estado transitorio de la carga de un modelo 3D
    const [glftDataLoading, setGlftDataLoading] = useState(false);
    const [gltfFileDownloadProgress, setGltfFileDownloadProgress] = useState(0);
    const fetchFemResFileWorker = useMemo(() => getFetchFemResFileWorker(), []);

    // Límites del mapa: al llegar datos nuevos se actualizan los iniciales y, si el usuario no ha movido
    // el mapa a otro sitio, también los actuales
    useEffect(() => {
        if (sameBounds(computedOuterBounds, initialOuterBounds)) return;
        if (sameBounds(outerBounds, initialOuterBounds)) setOuterBounds(computedOuterBounds);
        setInitialOuterBounds(computedOuterBounds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [computedOuterBounds]);

    useEffect(() => {
        const updatedAt = digitalTwinsQuery.dataUpdatedAt;
        if (!updatedAt || updatedAt === lastDigitalTwinsWarningAt || !digitalTwinsQuery.data) return;
        lastDigitalTwinsWarningAt = updatedAt;
        const inexistentDashboards = digitalTwinsQuery.data.filter((dt) => dt.dashboardUrl?.slice(0, 7) === "Warning");
        if (inexistentDashboards.length !== 0) toast.warning("Some dashboards no longer exist");
    }, [digitalTwinsQuery.dataUpdatedAt, digitalTwinsQuery.data]);

    const refreshBuildings = useCallback(() => reloadTable("buildings"), []);
    const refreshFloors = useCallback(() => reloadTable("floors"), []);
    const refreshOrgsOfGroupsManaged = useCallback(() => reloadTable("orgsOfGroupsManaged"), []);
    const refreshGroupsManaged = useCallback(() => reloadTable("groupsManaged"), []);
    const refreshAssetTypes = useCallback(() => reloadTable("assetTypes"), []);
    const refreshAssets = useCallback(() => reloadTable("assets"), []);
    const refreshAssetsWithMarker = useCallback(() => reloadTable("lastGeolocations"), []);
    const refreshSensors = useCallback(() => reloadTable("sensors"), []);
    const refreshDigitalTwins = useCallback(() => reloadTable("digitalTwins"), []);
    const refreshAssetS3Folders = useCallback(() => reloadTable("assetS3Folders"), []);

    const openDigitalTwin3DViewer = useCallback((digitalTwinGltfData: IDigitalTwinGltfData) => {
        setDigitalTwinGltfData(digitalTwinGltfData);
        setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS);
    }, [setDigitalTwinGltfData, setOptionToShow]);

    const setNewOuterBounds = (outerBounds: number[][]) => {
        setOuterBounds(outerBounds);
    };

    const selectBuilding = (building: IBuilding) => {
        setBuildingSelected(building);
    };

    const selectFloor = (floor: IFloor) => {
        setFloorSelected(floor);
    };

    const selectOrg = (org: IOrgOfGroupsManaged) => {
        setOrgSelected(org);
        setGroupSelected(null);
        setAssetSelected(null);
    };

    const selectGroup = (group: IGroupManaged) => {
        setGroupSelected(group);
        setAssetSelected(null);
    };

    const selectAssetMarker = (select: boolean) => {
        setAssetMarkerSelected(select);
    };

    const selectAsset = (asset: IAsset | null) => {
        setAssetSelected(asset);
    };

    const selectSensor = (sensor: ISensor | null) => {
        setSensorSelected(sensor);
    };

    const selectDigitalTwin = (digitalTwin: IDigitalTwin | null) => {
        setDigitalTwinSelected(digitalTwin);
        if (digitalTwin) {
            const assetS3FoldersFiltered = assetS3FoldersTable.filter((folder) => {
                return folder.assetId === digitalTwin.assetId && folder.isCurrent === "Yes";
            });
            setAssetS3Folders(assetS3FoldersFiltered);
        }
    };

    const resetBuildingSelection = () => {
        setBuildingSelected(null);
        setFloorSelected(null);
        setOrgSelected(null);
        setGroupSelected(null);
        selectAssetMarker(false);
    };

    const handleCloseViewer = () => {
        selectAsset(null);
        if (assetSelected) {
            const assetTypeId = assetSelected.assetTypeId;
            const assetType = assetTypesTable.find((at) => at.id === assetTypeId);
            if (assetType?.geolocationMode === "dynamic") {
                resetBuildingSelection();
                setOuterBounds(initialOuterBounds);
            }
        }
        // se libera el modelo 3D (ya no hace falta conservarlo)
        setDigitalTwinGltfData(null);
        setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION);
    };



    return (
        <>
            <ContentContainer>
                <>
                    {/* Con el visor del gemelo digital abierto, recargar tablas (p. ej. tras "Deploy changes")
                        no debe desmontarlo: se perdería la vista activa (Pipeline) y el estado del visor. */}
                    {glftDataLoading || (!isDigitalTwinViewerOpen && loading) ? (
                        <HomeOptionsLoader
                            key={gltfFileDownloadProgress}
                            glftDataLoading={glftDataLoading}
                            gltfFileDownloadProgress={gltfFileDownloadProgress}
                        />
                    ) : (
                        <>
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION && (
                                <GeolocationContainer
                                    buildings={buildingsFiltered}
                                    floors={floorsFiltered}
                                    orgsOfGroupsManaged={orgsOfGroupsManagedTable}
                                    groupsManaged={groupsManagedTable}
                                    assetTypes={assetTypesTable}
                                    assets={assetsTable}
                                    assetsWithMarker={assetsWithMarker}
                                    sensorTypes={sensorTypesTable}
                                    sensors={sensorsTable}
                                    digitalTwins={digitalTwinsTable}
                                    buildingSelected={buildingSelected}
                                    selectBuilding={selectBuilding}
                                    floorSelected={floorSelected}
                                    selectFloor={selectFloor}
                                    orgSelected={orgSelected}
                                    selectOrg={selectOrg}
                                    groupSelected={groupSelected}
                                    selectGroup={selectGroup}
                                    assetSelected={assetSelected}
                                    assetMarkerSelected={assetMarkerSelected}
                                    selectAsset={selectAsset}
                                    selectAssetMarker={selectAssetMarker}
                                    sensorSelected={sensorSelected}
                                    selectSensor={selectSensor}
                                    digitalTwinSelected={digitalTwinSelected}
                                    selectDigitalTwin={selectDigitalTwin}
                                    refreshBuildings={refreshBuildings}
                                    refreshFloors={refreshFloors}
                                    refreshOrgsOfGroupsManaged={refreshOrgsOfGroupsManaged}
                                    refreshGroupsManaged={refreshGroupsManaged}
                                    refreshAssetTypes={refreshAssetTypes}
                                    refreshAssets={refreshAssets}
                                    refreshAssetS3Folders={refreshAssetS3Folders}
                                    refreshAssetsWithMarker={refreshAssetsWithMarker}
                                    refreshSensors={refreshSensors}
                                    refreshDigitalTwins={refreshDigitalTwins}
                                    initialOuterBounds={initialOuterBounds}
                                    outerBounds={outerBounds}
                                    setNewOuterBounds={setNewOuterBounds}
                                    resetBuildingSelection={resetBuildingSelection}
                                    openDigitalTwin3DViewer={openDigitalTwin3DViewer}
                                    setGlftDataLoading={(glftDataLoading) => setGlftDataLoading(glftDataLoading)}
                                    digitalTwinsState={digitalTwinsState}
                                    setDigitalTwinsState={setDigitalTwinsState}
                                    sensorsState={sensorsState}
                                    setSensorsState={setSensorsState}
                                    setGltfFileDownloadProgress={(progress: number) =>
                                        setGltfFileDownloadProgress(progress)
                                    }
                                    setAssetWithCameraSelected={setAssetWithCameraSelected}
                                    setSensorWithCameraSelected={setSensorWithCameraSelected}
                                />
                            )}
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS && digitalTwinGltfData && (
                                <WebGLErrorBoundary>
                                    <Suspense fallback={<SceneLoader />}>
                                        <DigitalTwin3DViewer
                                            digitalTwinSelected={digitalTwinSelected}
                                            digitalTwinGltfData={digitalTwinGltfData}
                                            assetS3Folders={assetS3Folders}
                                            orgSelected={orgSelected}
                                            groupSelected={groupSelected}
                                            close3DViewer={handleCloseViewer}
                                            fetchFemResFileWorker={fetchFemResFileWorker}
                                            refreshDigitalTwins={refreshDigitalTwins}
                                            assetWithCameraSelected={assetWithCameraSelected}
                                            sensorWithCameraSelected={sensorWithCameraSelected}
                                        />
                                    </Suspense>
                                </WebGLErrorBoundary>
                            )}
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL && <Tutorial />}
                        </>
                    )}
                </>
            </ContentContainer>
        </>
    );
};

export default PlatformAssistantHomeOptions;
