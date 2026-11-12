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
import { setUiValue } from "../../../state/uiStore";
import { MAP_VIEW_KEY } from "../Geolocation/Map";
import { Search } from "lucide-react";
import { useAuthDispatch, useAuthState } from "../../../contexts/authContext";
import AssetSwitcher from "../AssetSwitcher/AssetSwitcher";
import {
    buildSwitcherEntries,
    isSwitcherShortcut,
    readRecentTwins,
    rememberTwin,
    RecentTwins,
    SwitcherEntry,
    SwitcherTwin,
} from "../AssetSwitcher/assetSwitcherData";
import openDigitalTwin from "../Geolocation/openDigitalTwin";

const ContentContainer = styled.div`
    position: relative;
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

// Opens the asset switcher from the map (on the Viewer it is the button in the top bar)
const MapSearchPill = styled.button`
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    width: min(420px, calc(100% - 140px));
    height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    background: rgba(23, 25, 28, 0.92);
    backdrop-filter: blur(6px);
    border: 1px solid #2f343a;
    border-radius: 20px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    color: #9aa1aa;
    font: 400 14px Roboto, "Helvetica Neue", Arial, sans-serif;
    text-align: left;
    cursor: pointer;

    &:hover {
        border-color: #4a515a;
        color: #c7cbd1;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }

    span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    kbd {
        flex: none;
        font: 400 11px Roboto, "Helvetica Neue", Arial, sans-serif;
        border: 1px solid #3a4048;
        border-radius: 4px;
        padding: 1px 6px;
    }

    @media (max-width: 640px) {
        width: calc(100% - 120px);
        kbd {
            display: none;
        }
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
    // asset switcher (Ctrl K)
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [recentTwins, setRecentTwins] = useState<RecentTwins>(() => readRecentTwins());

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

    // El gemelo seleccionado es una copia de su fila tomada al elegirlo: al recargarse la tabla (por ejemplo tras
    // editarlo: activar el chat, cambiar su idioma...) se sustituye por la fila nueva, para que el visor abierto
    // lo vea sin refrescar el navegador
    useEffect(() => {
        if (!digitalTwinSelected) return;
        const fresh = digitalTwinsTable.find((dt) => dt.id === digitalTwinSelected.id);
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(digitalTwinSelected)) setDigitalTwinSelected(fresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digitalTwinsTable]);

    const openDigitalTwin3DViewer = useCallback((digitalTwinGltfData: IDigitalTwinGltfData) => {
        setDigitalTwinGltfData(digitalTwinGltfData);
        setOptionToShow(PLATFORM_ASSISTANT_HOME_OPTIONS.DIGITAL_TWINS);
    }, [setDigitalTwinGltfData, setOptionToShow]);

    const switcherEntries = useMemo(
        () =>
            switcherOpen
                ? buildSwitcherEntries(
                      {
                          assets: assetsTable,
                          digitalTwins: digitalTwinsTable,
                          groups: groupsManagedTable,
                          orgs: orgsOfGroupsManagedTable,
                          buildings: buildingsFiltered,
                          floors: floorsFiltered,
                          digitalTwinsState,
                          sensorsState,
                      },
                      recentTwins,
                  )
                : [],
        [
            switcherOpen,
            assetsTable,
            digitalTwinsTable,
            groupsManagedTable,
            orgsOfGroupsManagedTable,
            buildingsFiltered,
            floorsFiltered,
            digitalTwinsState,
            sensorsState,
            recentTwins,
        ],
    );

    // the twin opened from the map also counts as recent
    useEffect(() => {
        if (!isDigitalTwinViewerOpen || !digitalTwinSelected) return;
        setRecentTwins((recent) => rememberTwin(recent, digitalTwinSelected.id, Date.now()));
    }, [isDigitalTwinViewerOpen, digitalTwinSelected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Ctrl K (or "/") opens the switcher on the map and on the Viewer, unless the user is typing
    const switcherAvailable =
        !loading &&
        !glftDataLoading &&
        (optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.GEOLOCATION || isDigitalTwinViewerOpen);
    useEffect(() => {
        if (!switcherAvailable) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || !isSwitcherShortcut(e)) return;
            e.preventDefault();
            setSwitcherOpen((open) => !open);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [switcherAvailable]);

    const openFromSwitcher = (entry: SwitcherEntry, twin: SwitcherTwin) => {
        setSwitcherOpen(false);
        const digitalTwin = twin.digitalTwin;
        if (isDigitalTwinViewerOpen && digitalTwinSelected?.id === digitalTwin.id) return;
        // the map keeps the place of the asset: building, floor, org, group and asset
        if (entry.building) setBuildingSelected(entry.building);
        if (entry.floor) setFloorSelected(entry.floor);
        if (entry.org) setOrgSelected(entry.org);
        if (entry.group) setGroupSelected(entry.group);
        setAssetSelected(entry.asset);
        setSensorSelected(null);
        setSensorWithCameraSelected(false);
        selectDigitalTwin(digitalTwin);
        setRecentTwins((recent) => rememberTwin(recent, digitalTwin.id, Date.now()));
        openDigitalTwin(digitalTwin, entry.asset, sensorsTable, {
            accessToken,
            refreshToken,
            authDispatch,
            setGlftDataLoading,
            setGltfFileDownloadProgress,
            openDigitalTwin3DViewer,
            setAssetWithCameraSelected,
        });
    };

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
                setUiValue(MAP_VIEW_KEY, null); // el mapa vuelve a encuadrarse, no a la vista anterior
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
                                <MapSearchPill
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-keyshortcuts="Control+K"
                                    onClick={() => setSwitcherOpen(true)}
                                >
                                    <Search size={16} aria-hidden="true" />
                                    <span>Go to an asset or digital twin…</span>
                                    <kbd aria-hidden="true">Ctrl K</kbd>
                                </MapSearchPill>
                            )}
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
                                            assetName={assetSelected?.description || assetSelected?.assetUid}
                                            onOpenAssetSwitcher={() => setSwitcherOpen(true)}
                                        />
                                    </Suspense>
                                </WebGLErrorBoundary>
                            )}
                            {optionToShow === PLATFORM_ASSISTANT_HOME_OPTIONS.TUTORIAL && <Tutorial />}
                        </>
                    )}
                </>
            </ContentContainer>
            <AssetSwitcher
                open={switcherOpen && switcherAvailable}
                entries={switcherEntries}
                currentDigitalTwinId={isDigitalTwinViewerOpen ? digitalTwinSelected?.id ?? null : null}
                onClose={() => setSwitcherOpen(false)}
                onOpenTwin={openFromSwitcher}
            />
        </>
    );
};

export default PlatformAssistantHomeOptions;
