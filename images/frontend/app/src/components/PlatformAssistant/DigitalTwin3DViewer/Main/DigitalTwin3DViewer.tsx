// DigitalTwin3DViewer.tsx
import { FC, ReactNode, SetStateAction, useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTable } from "../../../../state";
import { toMeasurements } from "../../../../tools/measurements";
import type { SensorInfo } from "../Objects/Sensors";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { type NatsConnection, headers } from "@nats-io/nats-core";
import { StringCodec } from "../../../../tools/natsCodec";

// Types and constants
import { IPipelineEdge, IPipelineNode, Viewer3DProps, ViewerOptions } from "../Types/types";
import { MOUSE_BUTTONS, LEGACY_COLOR_MANAGEMENT, BUTTON_LABELS } from "../Utils/constants";

// Components
import { Stage } from "../Utils/Stage";
import { GlassTweaks, RendererLighting } from "../Utils/SceneLighting";
import { CameraController, FollowStatus, SceneBounds } from "../Utils/CameraController";
import {
    backgroundUnderToneMapping,
    environmentShowsAsBackground,
    LightingOptions,
    lightingOf,
    toneMappingOf,
    twinLighting,
} from "../Utils/lighting";
import { saveTwinLighting } from "../Utils/twinViewerSettings";
import Model from "./Model";
import SetGltfObjects from "../Objects/SetGlftOjbects";
import SimulationLegend from "../Utils/SimulationLegend";
import ChatAssistant, { LlmMessage } from "../ChatAssitant/ChatAssistant";
import { createPipelineVoiceService } from "../ChatAssitant/voiceService";
import PipelineLogs, { PIPELINE_LOGS_WIDTH, PipelineLog, clampLogsWidth } from "../Pipeline/PipelineLogs";
import { levelOf } from "../Pipeline/pipelineLogsModel";
import SimulatorPanel from "../Workspace/SimulatorPanel";
import SimulatorFormatEditor from "../Workspace/SimulatorFormatEditor";
import EmptyModelPanel from "../Workspace/EmptyModelPanel";
import ModelRemovalDialog from "../Workspace/ModelRemovalDialog";
import { LostModel, lostModels } from "../Workspace/slideModelFiles";
import { useSlideModel } from "./slideModel";
import { Header } from "../Utils/Headers";
import AssistantPanel, { ASSISTANT_PANEL_CHAT_WIDTH, MODEL_SETTINGS_INSET, VIEWER_GAP, clampChatWidth } from "../AssistantPanel/AssistantPanel";
import { usePersistentState } from "../../../../state/uiStore";

// Styled components
import {
    CanvasContainer,
    FollowCameraBar,
    VIEWER_BACKGROUND_COLOR,
    SelectedObjectInfoContainer,
    ObjectInfoContainer,
    ObjectInfo,
    MaxMinValuesContainer,
    MaxMinFlexContainer,
    FemMaxValue,
    FemMinValue,
} from "../Utils/StyledComponents";

// Custom hooks
import {
    useViewerState,
    useViewerOptions,
    useRefs,
    useChatMessages,
    usePipelineLogs,
    useOpenWindowTab,
    useLegendRenderer,
    useFemResults,
    usePipelineActions,
    useImageFrame,
    usePipelineState,
    useNatsConnection,
} from "../Utils/customHooks";

// Handlers
import { createHandlers } from "../Utils/handlers";
import { useAuthDispatch, useAuthState } from "../../../../contexts/authContext";
import { useLoggedUserLogin } from "../../../../contexts/authContext/authContext";
import { natsUserChatSubject } from "../../../../tools/natsInbox";
import { useMediaQuery } from "../../../../tools/useMediaQuery";
import { viewerContents } from "../Utils/viewerContents";
import PipelineErrorBoundary from "../Pipeline/PipelineErrorBoundary";
import { forgetViewer, getViewerMemory, rememberViewer } from "../../../../state/viewerMemoryStore";
import {
    AssetState,
    FemSimulationObjectState,
    generateInitialFemSimObjectsState,
    GenericObjectState,
    SensorState,
} from "../ViewerTools/ViewerUtils";
import Flow, { processInitialPipelineData } from "../Pipeline/Flow";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "react-toastify";
import { Download, Pencil, SlidersHorizontal, Upload, Video } from "lucide-react";
import { ImageFrame } from "../PhotoFrame/PhotoFrame";
import ViewerWorkspace, { PanelAction } from "../Workspace/ViewerWorkspace";
import ModelFilesTab from "../AssistantPanel/ModelFilesTab";
import ChartPanel from "../Workspace/ChartPanel";
import PanelEditor from "../Workspace/PanelEditor";
import TimePicker from "../Workspace/charts/TimePicker";
import { DEFAULT_PAGE_TIME, PageTime, RefreshClock, TimeRange, createRefreshClock, isLive, refreshMs, resolveRange } from "../Workspace/charts/timeRange";
import HistoryPanel, { HistoryActions } from "../Workspace/HistoryPanel";
import { historyPanelApi } from "../Workspace/historyPanelsApi";
import AssetStatePanel, { AssetStateEditor, settingsOfPanel } from "../Workspace/AssetStatePanel";
import {
    GroupAssetStateEditor,
    GroupAssetStatePanel,
    HealthPanel,
    OrganizationScopeNotice,
    PipelineLogsPanel,
} from "../Workspace/ControlRoomPanels";
import { controlRoomApi, controlRoomLogsApi, scopeOfDigitalTwin } from "../Workspace/controlRoom";
import { orgOverviewApi } from "../Workspace/orgOverview";
import { OrgOverviewEditor, OrgOverviewPanel } from "../Workspace/OrgOverviewPanel";
import { assetStateApi } from "../Workspace/assetStateApi";
import { chartSeriesOptions } from "../Workspace/chartSeries";
import { fetchTimeSeries, TimeSeriesQuery } from "../Workspace/timeSeriesApi";
import WorkspaceControls, { SoundToggle } from "../Workspace/WorkspaceControls";
import ViewerDataMenu from "../Workspace/ViewerDataMenu";
import ViewerDataLoadDialog, { ItemState } from "../Workspace/ViewerDataLoadDialog";
import {
    DataFile,
    VIEWER_DATA_FILE_NAME,
    ViewerDataItem,
    ViewerDataPart,
    ViewerDataSet,
    SlideFiles,
    buildViewerDataZip,
    pipelineYamlOf,
    readViewerDataFiles,
    simulatorFormatOf,
} from "../Workspace/viewerData";
import {
    applyViewerData,
    fetchFemResults,
    fetchModel,
    listFemResults,
    copySlideModel,
    removeModel as removeTwinModel,
    setMaxFemResults,
} from "../Workspace/viewerDataApi";
import { writeZip } from "../Workspace/zipStream";
import NatsPermissionNotice from "../Workspace/NatsPermissionNotice";
import { soundTopics, SOUND_TOPIC, useViewerSounds } from "../Workspace/viewerSounds";
import {
    ANY_IMAGE_SOURCE,
    WorkspaceLayout,
    WorkspacePanel,
    effectiveWorkspaceLayout,
    imageSourceOptions,
    deviceImageSources,
    DEVICE_IMAGE_SOURCE,
    sameLayout,
    replacePanel,
    setLayoutTime,
    addSlide,
    currentSlideOf,
    duplicateSlide,
    moveSlide,
    removeSlide,
    replaceSlide,
    sanitizeSimulatorFormat,
    setSimulatorFormat,
    SimulatorParameter,
    reorderSlide,
    setSlidesHidden,
    slideTags,
    stepSlide,
    updateSlide,
    visibleSlides,
    WORKSPACE_PHONE_BELOW,
} from "../Workspace/workspaceLayout";
import SlideBar from "../Workspace/SlideBar";
import AllSlides from "../Workspace/AllSlides";
import ViewerConfigDialog from "../Workspace/ViewerConfigDialog";
import { acknowledgeAlarms, describeAlarmError, resetAlarms, shelveAlarms } from "../Pipeline/alarmCommands";
import { approvalSubject, decideApprovalRequest, describeApprovalError } from "../Pipeline/approvalRequests";
import { MarkdownEditor, MarkdownView } from "../Workspace/MarkdownPanel";
import { PictureEditor, PictureFiles, PictureView } from "../Workspace/PicturePanel";
import {
    deleteViewerImage,
    isPendingViewerImage,
    listViewerImages,
    loadViewerImage,
    onViewerImageChange,
    setPendingViewerImages,
    uploadViewerImage,
    uploadViewerImages,
    viewerImageBytes,
} from "../Workspace/viewerImagesApi";
import {
    PackageImage,
    buildViewerPackage,
    describePackageImages,
    isZipName,
    layoutImageNames,
    packageImageWarnings,
    readViewerPackage,
} from "../Workspace/viewerPackage";
import { SLIDE_FIELD, createLiveValueStore, liveTopicRefs, liveTopicsOf, scopedToSlide, topicRefsOf, useLiveValues } from "../Workspace/liveValues";
import {
    ParsedViewerConfig,
    buildViewerConfig,
    checkViewerConfigRefs,
    downloadBlob,
    parseViewerConfig,
    viewerConfigFileName,
    viewerConfigText,
} from "../Workspace/viewerConfig";
import ModelSlot, { createModelHost } from "../Workspace/ModelSlot";
import { SurfaceView } from "../Workspace/surface/SurfacePanel";
import { SurfaceEditor } from "../Workspace/surface/SurfaceEditor";
import { surfaceTopics } from "../Workspace/surface/surfacePanel";
import {
    SavedViewerLayout,
    deleteViewerLayout,
    fetchViewerLayout,
    saveViewerLayout,
} from "../Workspace/viewerLayoutApi";
import {
    ChatAttachmentService,
    fetchChatAttachmentsConfig,
    makeChatAttachmentService,
} from "../ChatAssitant/chatAttachments";
import useNatsSubscription from "../NatsHook/useNatsSubcription";
import { filterNatsSubject } from "../NatsHook/tools";
import useDeviceImages from "../NatsHook/useDeviceImages";
import * as THREE from "three";
import { browserTimeZone } from "../../../../tools/timeZones";

const sc = StringCodec();

// the topics whose images an Image panel of the Viewer page can show (any other topic that sends images is
// offered too, once it has sent one)
// the topics with images an Image panel can show: the pipeline's and the asset's device topics (dev2dtm_n)
const isImageTopicRef = (ref: string) => ref === "dtm2sim" || DEVICE_IMAGE_SOURCE.test(ref);

const resolveSetStateAction = <T extends unknown>(action: SetStateAction<T>, prevValue: T): T => {
    return typeof action === "function" ? (action as (prev: T) => T)(prevValue) : action;
};

const ShaderPrewarm: FC<{ gltfData: any }> = ({ gltfData }) => {
    const { gl, scene, camera } = useThree();

    useEffect(() => {
        gl.compile(scene, camera);
    }, [gl, scene, camera, gltfData]);

    return null;
};

// Visibilidad por colección: al volver a montar el visor se conserva la que tenía el usuario para las
// colecciones que siguen existiendo
const mergeVisibilityState = <T,>(initial: Record<string, T>, previous: Record<string, T> | undefined) => {
    const merged: Record<string, T> = {};
    for (const key of Object.keys(initial)) merged[key] = previous?.[key] ?? initial[key];
    return merged;
};

// Guarda en la memoria del visor la cámara que deja el usuario (al terminar cada giro, desplazamiento o
// zoom con los controles de órbita): al volver al visor, Stage la recupera en lugar de encuadrar el modelo.
const CameraMemory: FC<{ dtUid: string; slideId?: string; controlsRef: { current: any } }> = ({ dtUid, slideId, controlsRef }) => {
    const camera = useThree((state) => state.camera);
    const size = useThree((state) => state.size);
    const sizeRef = useRef(size);
    sizeRef.current = size;
    useEffect(() => {
        const ctrl = controlsRef.current;
        if (!ctrl || !dtUid) return;
        const save = () => {
            const viewSize = Math.min(sizeRef.current.width, sizeRef.current.height);
            if (viewSize <= 0) return;
            const view = {
                position: camera.position.toArray() as [number, number, number],
                target: ctrl.target.toArray() as [number, number, number],
                zoom: camera.zoom,
                viewSize,
            };
            // that of the slide's model (each slide has its own)
            const cameras = slideId ? { ...getViewerMemory(dtUid).cameras, [slideId]: view } : getViewerMemory(dtUid).cameras;
            rememberViewer(dtUid, { camera: view, cameras });
        };
        ctrl.addEventListener("end", save);
        return () => ctrl.removeEventListener("end", save);
    }, [camera, controlsRef, dtUid, slideId]);
    return null;
};

// The range of the page at the last refresh, for the components that need it (they alone draw again at
// every tick of the clock)
const PageClock: FC<{ clock: RefreshClock; time: PageTime; children: (range: TimeRange, tick: number) => ReactNode }> = ({ clock, time, children }) => {
    const tick = useSyncExternalStore(clock.subscribe, clock.get);
    const range = useMemo(
        () => resolveRange(time, Date.now()) ?? resolveRange(DEFAULT_PAGE_TIME, Date.now())!,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [time.from, time.to, tick],
    );
    return <>{children(range, tick)}</>;
};

// below this height (CSS pixels) the Viewer page scrolls: a phone held sideways
const VIEWER_LOW_SCREEN_BELOW = 520;

// what the wrapper (DigitalTwin3DViewer, below) adds: the 3D model of the slide shown (slideModel.ts)
interface SceneProps {
    // the slide shown, when it has a 3D Model panel (null: it has none; the model loaded stays)
    onShownSlide?: (slideId: string | null) => void;
    // the model of the slide is being read (the fraction of its download), or could not be
    slideModelLoading?: number | null;
    slideModelError?: string | null;
    // the format of the simulator of the slide shown, when it has its own (null: the digital twin's)
    onSlideSimulatorFormat?: (format: Record<string, SimulatorParameter> | null) => void;
}

const DigitalTwin3DViewerScene: FC<Viewer3DProps & SceneProps> = ({
    digitalTwinSelected,
    digitalTwinGltfData,
    onShownSlide,
    onSlideSimulatorFormat,
    slideModelLoading = null,
    slideModelError = null,
    assetS3Folders,
    orgSelected,
    groupSelected,
    close3DViewer,
    fetchFemResFileWorker,
    refreshDigitalTwins,
    assetWithCameraSelected,
    sensorWithCameraSelected,
    assetName,
    onOpenAssetSwitcher,
    onReloadDigitalTwin,
}) => {
    // Hooks
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const dtUid = digitalTwinSelected?.digitalTwinUid ?? "";
    // Memoria del visor de este gemelo digital (vista activa, opciones, pipeline sin desplegar, logs): si el
    // visor se vuelve a montar (cambio de capa, recarga de datos) se recupera lo que tenía el usuario.
    const memory = useMemo(() => getViewerMemory(dtUid), [dtUid]);
    const [state, setState] = useViewerState(memory.activeViewer, !!memory.pipeline?.changed, memory.panels);
    useEffect(() => {
        rememberViewer(dtUid, { activeViewer: state.activeViewer });
    }, [dtUid, state.activeViewer]);
    useEffect(() => {
        rememberViewer(dtUid, {
            panels: {
                assistantPanel: state.isAssistantPanelOpen,
                chatAssistant: state.isChatAssistantOpen,
                pipelineLogs: state.isPipelineLogsOpen,
            },
        });
    }, [dtUid, state.isAssistantPanelOpen, state.isChatAssistantOpen, state.isPipelineLogsOpen]);
    // El chat es una pestaña del panel del asistente: isChatAssistantOpen indica que esa pestaña es la elegida, y el chat
    // está a la vista cuando además el panel del asistente está abierto. En las vistas Imagen y Pipeline (gemelos sin
    // modelo 3D) el panel del asistente solo tiene el chat.
    const chatEnabled = !!digitalTwinSelected?.chatAssistantEnabled;
    // The Viewer page ("3D"): its slides of panels (Workspace/). Each slide has its own 3D model (at most one, in its
    // 3D Model panel: slideModel.ts); viewerHasModel: that of the slide shown is loaded. A twin without models nor
    // camera opens on its pipeline (its editors have the Viewer page, to load them).
    const twinHasModels = Object.values(digitalTwinGltfData.slideModels ?? {}).some((m) => !!m.gltfFileName);
    const viewerHasModel = !!digitalTwinGltfData.gltfFile && !!digitalTwinGltfData.digitalTwinGltfUrl;
    const viewerHasImage = !!assetWithCameraSelected;
    // the scope of the twin (its asset's context, from admin_api; else from the assets table): a group's control
    // room and the organization overview have no model nor camera, but their Viewer page with their panels
    const assetsForScope = useTable("assets");
    const dtScope = useMemo(
        () =>
            digitalTwinGltfData?.assetContext === "group" || digitalTwinGltfData?.assetContext === "organization"
                ? digitalTwinGltfData.assetContext
                : scopeOfDigitalTwin(digitalTwinSelected, assetsForScope),
        [digitalTwinGltfData?.assetContext, digitalTwinSelected, assetsForScope],
    );
    // the group's editors and administrators always have the Viewer page: to load its Viewer data
    const groupsManagedForViewer = useTable("groupsManaged");
    const isTwinEditor = !!digitalTwinSelected && groupsManagedForViewer.some((group) => group.id === digitalTwinSelected.groupId);
    const viewerAvailable = twinHasModels || viewerHasImage || dtScope !== "asset" || isTwinEditor;
    const showOnlyPipelineViewer = !viewerAvailable;
    // the panel shown full page (by everybody, without editing the layout)
    const [maximizedPanel, setMaximizedPanel] = useState<string | null>(memory.workspaceMaximized ?? null);
    // the user's own changes to the layout (not saved: they last while the viewer is open)
    const [localLayout, setLocalLayout] = useState<WorkspaceLayout | null>(
        (memory.workspaceLayout as WorkspaceLayout | undefined) ?? null,
    );
    // the slide shown and the slides the user hid from the slide bar: remembered while the viewer is open
    const [slideId, setSlideId] = useState<string | null>(memory.workspaceSlide ?? null);
    const [hiddenSlides, setHiddenSlides] = useState<string[]>(memory.workspaceHiddenSlides ?? []);
    useEffect(() => {
        rememberViewer(dtUid, {
            workspaceLayout: localLayout ?? undefined,
            workspaceMaximized: maximizedPanel,
            workspaceSlide: slideId,
            workspaceHiddenSlides: hiddenSlides,
        });
    }, [dtUid, localLayout, maximizedPanel, slideId, hiddenSlides]);
    // the element the 3D model is rendered in (see ModelSlot)
    const modelHost = useMemo(createModelHost, []);
    // the range of time and refresh chosen on the page (not saved: as in a Grafana dashboard, until the layout
    // is saved with them)
    const [localTime, setLocalTime] = useState<PageTime | null>((memory.workspaceTime as PageTime | undefined) ?? null);
    useEffect(() => {
        rememberViewer(dtUid, { workspaceTime: localTime ?? undefined });
    }, [dtUid, localTime]);
    const chatTabSelected = chatEnabled && state.isChatAssistantOpen;
    // a phone held upright: the assistant panel covers the viewer, so it has a button to go back to it
    const narrowScreen = useMediaQuery(`(max-width: ${WORKSPACE_PHONE_BELOW - 1}px)`);
    // the side panel is the chat with the assistant: in the Viewer, and in the pipeline of a twin without viewer
    // (the 3D model's settings are in its own panel: modelSettingsOpen)
    const assistantPanelShown = state.isAssistantPanelOpen && chatEnabled && (state.activeViewer === "3D" || showOnlyPipelineViewer);
    const chatVisible = assistantPanelShown;
    // the settings of the 3D model, over the model in its panel (its gear); for everybody
    const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
    // the Simulator panel shows the editor of its format (its Edit icon, for the group's editors and administrators)
    const [simulatorEditing, setSimulatorEditing] = useState(false);
    const chatVisibleRef = useRef(chatVisible);
    chatVisibleRef.current = chatVisible;
    // con chat el panel lateral es más ancho y tiene el mismo ancho en todas las pestañas (el usuario lo
    // puede cambiar arrastrando su borde izquierdo y se conserva)
    const [chatWidth, setChatWidth] = usePersistentState<number>("assistantPanel.width", ASSISTANT_PANEL_CHAT_WIDTH);
    const assistantPanelWidth = clampChatWidth(chatWidth);
    // respuesta del asistente que ha llegado sin estar el chat a la vista
    const [chatUnread, setChatUnread] = useState(false);
    useEffect(() => {
        if (chatVisible) {
            setChatUnread(false);
            toast.dismiss("chat-answer-unread");
        }
    }, [chatVisible]);

    const handleClose3DViewer = useCallback(() => {
        forgetViewer(dtUid);
        close3DViewer();
    }, [dtUid, close3DViewer]);

    // Grupo y organización del gemelo digital: si no hay ninguno seleccionado en el mapa (o es otro),
    // se buscan en las tablas a partir del groupId del gemelo digital.
    const groupsManagedTable = useTable("groupsManaged");
    // the user's default time zone (profile); "": the browser's
    const userProfile = useTable("userProfile");
    const userTimeZone = userProfile?.timezone || browserTimeZone();
    // nombre y medidas de los sensores del activo del gemelo, para sus marcadores (por sensorRef)
    const sensorsTable = useTable("sensors");
    const sensorTypesTable = useTable("sensorTypes");
    const sensorsInfo = useMemo(() => {
        const info: Record<string, SensorInfo> = {};
        const assetId = digitalTwinSelected?.assetId;
        for (const sensor of sensorsTable) {
            if (assetId !== undefined && sensor.assetId !== assetId) continue;
            info[sensor.sensorRef] = {
                description: sensor.description,
                sensorType: sensor.sensorType,
                measurements: toMeasurements(sensor.measurements),
            };
        }
        return info;
    }, [sensorsTable, digitalTwinSelected?.assetId]);
    // the group and organization of the twin: among all those the user is a member of (a Viewer manages none)
    const groupsViewableTable = useTable("groupsViewable");
    const orgsOfGroupsManagedTable = useTable("orgsOfGroupsViewable");
    const dtGroup = useMemo(() => {
        const groupId = digitalTwinSelected?.groupId;
        if (groupSelected && (groupId === undefined || groupSelected.id === groupId)) return groupSelected;
        return groupsViewableTable.find((group) => group.id === groupId) ?? groupSelected ?? null;
    }, [groupSelected, groupsViewableTable, digitalTwinSelected?.groupId]);
    const dtOrg = useMemo(() => {
        const orgId = dtGroup?.orgId;
        if (orgSelected && (orgId === undefined || orgSelected.id === orgId)) return orgSelected;
        return orgsOfGroupsManagedTable.find((org) => org.id === orgId) ?? orgSelected ?? null;
    }, [orgSelected, orgsOfGroupsManagedTable, dtGroup]);
    const legendRenderer = useLegendRenderer();
    const { connectionStatus, natsClient } = useNatsConnection();
    const openDashboardTab = useOpenWindowTab();
    const { frameStore, handleImageUrlChange } = useImageFrame();

    const {
        canvasContainerRef,
        canvasRef,
        controlsRef,
        selectedObjTypeRef,
        selectedObjNameRef,
        femMaxValueRef,
        femMinValueRef,
        selectedObjCollectionNameRef,
    } = useRefs();

    // the first time in the session, the twin's own lighting (saved by a group administrator) over the defaults
    const [savedTwinLighting, setSavedTwinLighting] = useState(() => twinLighting(digitalTwinSelected?.viewerSettings));
    const [savingLighting, setSavingLighting] = useState(false);
    const [opts, setOpts] = useViewerOptions([], memory.opts as ViewerOptions | undefined, savedTwinLighting);
    // the camera driven from outside (pipeline poses, AI agent, view buttons): Utils/CameraController
    const sceneBoundsRef = useRef<SceneBounds | null>(null);
    const handleSceneBounds = useCallback((center: THREE.Vector3, radius: number) => {
        sceneBoundsRef.current = { center, radius };
    }, []);
    const [followStatus, setFollowStatus] = useState<FollowStatus>({ active: false, released: false });
    const [followReleased, setFollowReleased] = useState(false);
    const handleSaveLighting = useCallback(async () => {
        if (!digitalTwinSelected) return;
        setSavingLighting(true);
        const lighting = lightingOf(opts);
        const saved = await saveTwinLighting(digitalTwinSelected, lighting, accessToken, refreshToken, authDispatch);
        if (saved) setSavedTwinLighting(lighting);
        setSavingLighting(false);
    }, [digitalTwinSelected, opts, accessToken, refreshToken, authDispatch]);
    useEffect(() => {
        rememberViewer(dtUid, { opts });
    }, [dtUid, opts]);
    // Cuando el AI Agent cambia el simulador, el visor deja de leer las medidas reales (como "Lock read
    // measurements", pero sin pedir las últimas medidas, que pisarían los valores): si no, la siguiente
    // medida los sustituía y nunca llegaban al pipeline.
    const simulatorRef = useRef<{ format?: any; onChange?: () => void }>({});
    simulatorRef.current = {
        format: digitalTwinGltfData.digitalTwinSimulationFormat,
        onChange: () =>
            setState((prev) =>
                prev.digitalTwinSimulatorSendData
                    ? prev
                    : {
                          ...prev,
                          digitalTwinSimulatorSendData: true,
                          lockReadingButtomLabel: BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS,
                      },
            ),
    };
    const { chatMessages, setChatMessages, handleUpdateChatAssistantMessages } = useChatMessages(setOpts, simulatorRef);
    const { logMessages, setLogMessages, handleUpdateLogMessages } = usePipelineLogs(
        setChatMessages,
        memory.logMessages as PipelineLog[] | undefined,
    );
    useEffect(() => {
        rememberViewer(dtUid, { logMessages });
    }, [dtUid, logMessages]);
    const sim2stateTopic =
        digitalTwinGltfData?.natsSubjectsData?.find((subject) => subject.topicRef === "sim2state")?.natsSubject ||
        "";
    const {
        pipelineStatus,
        pipelineLeaderReplicaIndex,
        handlePipelineStatusChange,
        handlePipelineLeaderReplicaIndexChange,
        queryPipelineStatus,
        queryChatMessages,
        handleSetChatMessages,
        handleRemoveChatAssistantHistory,
    } = usePipelineState(digitalTwinSelected, natsClient, sim2stateTopic, setChatMessages);

    // Initialize FEM results logic
    // the FEM results of the model shown: those of its slide
    const femResults = useFemResults(
        digitalTwinSelected,
        legendRenderer,
        opts,
        fetchFemResFileWorker,
        digitalTwinGltfData.gltfFile ? digitalTwinGltfData.slideId : undefined,
    );

    // Update state with FEM results when they change
    useEffect(() => {
        setState((prev) => ({
            ...prev,
            femResultDates: femResults.femResultDates,
            femResultFileNames: femResults.femResultFileNames,
            femResultData: femResults.femResultData,
            femSimulationGeneralInfo: femResults.femSimulationGeneralInfo,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        femResults.femResultDates,
        femResults.femResultFileNames,
        femResults.femResultData,
        femResults.femSimulationGeneralInfo,
    ]);

    useEffect(() => {
        if (digitalTwinSelected && natsClient) {
            queryPipelineStatus();
            queryChatMessages();
        }
    }, [queryPipelineStatus, digitalTwinSelected, queryChatMessages, natsClient]);

    // Create handlers
    // el panel del asistente estaba abierto al pasar del visor al pipeline (se vuelve a abrir al volver)
    const reopenAssistantPanelRef = useRef(false);
    const handlers = createHandlers(
        {
            digitalTwinSelected,
            digitalTwinGltfData,
            activeViewer: state.activeViewer,
            assetWithCameraSelected,
            viewerHasModel,
            accessToken,
            refreshToken,
            authDispatch: authDispatch,
            sensorObjects: state.sensorObjects,
            assetObjects: state.assetObjects,
            genericObjects: state.genericObjects,
            lockReadingButtomLabel: state.lockReadingButtomLabel,
            getLastMeasurementsButtomLabel: state.getLastMeasurementsButtomLabel,
            initialDigitalTwinSimulatorState: state.initialDigitalTwinSimulatorState,
            generalTransparencyIndex: state.generalTransparencyIndex,
            isAssistantPanelOpen: state.isAssistantPanelOpen,
            isChatAssistantOpen: chatTabSelected,
            isAssistantPanelShown: assistantPanelShown,
            isPipelineLogsOpen: state.isPipelineLogsOpen,
            isPipelineUiChanged: state.isPipelineUiChanged,
            openDashboardTab,
            reopenAssistantPanelRef,
        },
        {
            setActiveViewer: (viewer) => setState((prev) => ({ ...prev, activeViewer: viewer })),
            setGetLastMeasurementsButtomLabel: (label) =>
                setState((prev) => ({ ...prev, getLastMeasurementsButtomLabel: label })),
            setInitialDigitalTwinSimulatorState: (state) =>
                setState((prev) => ({
                    ...prev,
                    initialDigitalTwinSimulatorState: resolveSetStateAction(
                        state,
                        prev.initialDigitalTwinSimulatorState,
                    ),
                })),
            setLockReadingButtomLabel: (label) => setState((prev) => ({ ...prev, lockReadingButtomLabel: label })),
            setDigitalTwinSimulatorSendData: (send) =>
                setState((prev) => ({
                    ...prev,
                    digitalTwinSimulatorSendData: resolveSetStateAction(send, prev.digitalTwinSimulatorSendData),
                })),
            setInitialSensorsState: (state) => setState((prev) => ({ ...prev, initialSensorsState: state })),
            setInitialAssetsState: (state) => setState((prev) => ({ ...prev, initialAssetsState: state })),
            setInitialGenericObjectsState: (state) =>
                setState((prev) => ({ ...prev, initialGenericObjectsState: state })),
            setIsAssistantPanelOpen: (open) => setState((prev) => ({ ...prev, isAssistantPanelOpen: open })),
            setChatAssistantOpen: (open) =>
                setState((prev) => ({
                    ...prev,
                    isChatAssistantOpen: resolveSetStateAction(open, prev.isChatAssistantOpen),
                })),
            setPipelineLogsOpen: (open) =>
                setState((prev) => ({
                    ...prev,
                    isPipelineLogsOpen: resolveSetStateAction(open, prev.isPipelineLogsOpen),
                })),
            setShowDtSimulatorModal: (show) => setState((prev) => ({ ...prev, showDtSimulatorModal: show })),
            setGeneralTransparencyIndex: (index) => setState((prev) => ({ ...prev, generalTransparencyIndex: index })),
            setIsPipelineUiChanged: (changed) => setState((prev) => ({ ...prev, isPipelineUiChanged: changed })),
            setOpts,
        },
    );

    // Update legend renderer in state when it changes
    useEffect(() => {
        if (legendRenderer) {
            setState((prev) => ({ ...prev, legendRenderer }));
        }
    }, [legendRenderer, setState]);

    // Update visibility states in options when they change
    useEffect(() => {
        if (state.initialGenericObjectsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                genericObjectsVisibilityState: mergeVisibilityState(state.initialGenericObjectsVisibilityState || {}, prev.genericObjectsVisibilityState),
            }));
        }
    }, [state.initialGenericObjectsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialSensorsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                sensorsVisibilityState: mergeVisibilityState(state.initialSensorsVisibilityState || {}, prev.sensorsVisibilityState),
            }));
        }
    }, [state.initialSensorsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialAssetsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                assetsVisibilityState: mergeVisibilityState(state.initialAssetsVisibilityState || {}, prev.assetsVisibilityState),
            }));
        }
    }, [state.initialAssetsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialFemSimObjectsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                femSimulationObjectsVisibilityState: mergeVisibilityState(
                    state.initialFemSimObjectsVisibilityState || {},
                    prev.femSimulationObjectsVisibilityState,
                ),
            }));
        }
    }, [state.initialFemSimObjectsVisibilityState, setOpts]);

    // Update FEM result names when data changes
    useEffect(() => {
        if (
            state.femSimulationObjects.length !== 0 &&
            state.femResultData &&
            Object.keys(state.femResultData).length !== 0
        ) {
            const femResultNames = state.femResultData.metadata.resultFields.map(
                (resultField: { resultName: string }) => resultField.resultName,
            );
            setState((prev) => ({ ...prev, femResultNames }));
        }
    }, [state.femSimulationGeneralInfo, state.femSimulationObjects, state.femResultData, setState]);

    // Update initial FEM sim objects state when data changes
    useEffect(() => {
        if (digitalTwinSelected && state.femResultData && state.femSimulationObjects.length !== 0) {
            const initialFemSimObjectsState = generateInitialFemSimObjectsState(
                state.femSimulationObjects,
                digitalTwinGltfData,
                state.femResultData,
            );
            setState((prev) => ({ ...prev, initialFemSimObjectsState }));
        }
    }, [state.femResultData, state.femSimulationObjects, digitalTwinSelected, digitalTwinGltfData, setState]);

    // Update digital twin simulator state when format changes
    useEffect(() => {
        if (Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat).length !== 0) {
            const digitalTwinSimulationFormat = digitalTwinGltfData.digitalTwinSimulationFormat;
            const digitalTwinSimulatorState: Record<string, number> = {};
            Object.keys(digitalTwinSimulationFormat).forEach((paramName) => {
                if (state.initialDigitalTwinSimulatorState[paramName] !== undefined) {
                    digitalTwinSimulatorState[paramName] = state.initialDigitalTwinSimulatorState[paramName];
                } else {
                    digitalTwinSimulatorState[paramName] = digitalTwinSimulationFormat[paramName].defaultValue;
                }
            });
            setOpts((prev) => ({ ...prev, digitalTwinSimulatorState }));
        }
    }, [state.initialDigitalTwinSimulatorState, digitalTwinGltfData.digitalTwinSimulationFormat, setOpts]);

    // Update min/max values display
    useEffect(() => {
        if (
            state.femResultData &&
            opts.femSimulationResult !== "None result" &&
            state.femMinValues.length !== 0 &&
            femMinValueRef.current
        ) {
            const femMinValuesFiltered: number[] = [];
            if (!opts.hideAllFemSimulationObjects) {
                state.femSimulationObjects.forEach((obj, index) => {
                    const collectionName = obj.collectionName;
                    if (!opts.femSimulationObjectsVisibilityState[collectionName]?.hide) {
                        femMinValuesFiltered.push(state.femMinValues[index]);
                    }
                });
            }

            if (femMinValuesFiltered.length !== 0) {
                const sortedFemMinValues = femMinValuesFiltered.slice().sort((a, b) => a - b);
                const resultFields = state.femResultData.metadata.resultFields;
                const resultFieldFiltered = resultFields.filter(
                    (result: { resultName: string }) => result.resultName === opts.femSimulationResult,
                )[0];
                let units = "";
                if (resultFieldFiltered !== undefined) {
                    units = resultFieldFiltered.units;
                }
                (femMinValueRef.current as any).innerHTML =
                    `Min value: ${sortedFemMinValues[0].toExponential(4)} ${units}`;
            } else {
                (femMinValueRef.current as any).innerHTML = "Min value: -";
            }
        }
    }, [
        opts.femResultDate,
        opts.femSimulationResult,
        opts.hideAllFemSimulationObjects,
        opts.femSimulationObjectsVisibilityState,
        state.femMinValues,
        state.femResultData,
        state.femSimulationObjects,
        femMinValueRef,
    ]);

    useEffect(() => {
        if (
            state.femResultData &&
            opts.femSimulationResult !== "None result" &&
            state.femMaxValues.length !== 0 &&
            femMaxValueRef.current
        ) {
            const femMaxValuesFiltered: number[] = [];
            if (!opts.hideAllFemSimulationObjects) {
                state.femSimulationObjects.forEach((obj, index) => {
                    const collectionName = obj.collectionName;
                    if (!opts.femSimulationObjectsVisibilityState[collectionName]?.hide) {
                        femMaxValuesFiltered.push(state.femMaxValues[index]);
                    }
                });
            }

            if (femMaxValuesFiltered.length !== 0) {
                const sortedFemMaxValues = femMaxValuesFiltered.slice().sort((a, b) => b - a);
                const resultFields = state.femResultData.metadata.resultFields;
                const resultFieldFiltered = resultFields.filter(
                    (result: { resultName: string }) => result.resultName === opts.femSimulationResult,
                )[0];
                if (resultFieldFiltered) {
                    const units = resultFieldFiltered.units;
                    (femMaxValueRef.current as any).innerHTML =
                        `Max value: ${sortedFemMaxValues[0].toExponential(4)} ${units}`;
                }
            } else {
                (femMaxValueRef.current as any).innerHTML = "Max value: -";
            }
        }
    }, [
        opts.femResultDate,
        opts.femSimulationResult,
        opts.hideAllFemSimulationObjects,
        opts.femSimulationObjectsVisibilityState,
        state.femMaxValues,
        state.femResultData,
        state.femSimulationObjects,
        femMaxValueRef,
    ]);

    const [currentSensorsState, setCurrentSensorsState] = useState<Record<string, SensorState>>({});
    const [currentAssetsState, setCurrentAssetsState] = useState<Record<string, AssetState>>({});
    const [currentGenericObjectsState, setCurrentGenericObjectsState] = useState<Record<string, GenericObjectState>>(
        {},
    );
    const [currentFemSimulationObjectsState, setCurrentFemSimulationObjectsState] = useState<
        FemSimulationObjectState[]
    >([]);

    const [lastNatsMessageSent, setLastNatsMessageSent] = useState("");

    const digitalTwinModelNatsTopic =
        digitalTwinGltfData?.natsSubjectsData?.filter((subject) => subject.topicRef === "sim2dtm")[0] || null;
    const digitalTwinModelChatAssistantTopic =
        digitalTwinGltfData?.natsSubjectsData?.filter((subject) => subject.topicRef === "sim2llm")[0] || null;
    // voz del asistente con el pipeline (peticiones NATS al tópico dev2dtm del gemelo digital) cuando el
    // navegador no tiene reconocimiento de voz o voces para leer las respuestas
    const voiceTopicSubject =
        digitalTwinGltfData?.natsSubjectsData?.find((subject) => subject.topicRef === "dev2dtm")?.natsSubject ?? null;
    // primero el servicio de voz de pipelines (sin nodos: en la copia del usuario del tópico sim2state); si no
    // responde, los nodos de voz del pipeline en dev2dtm
    const voiceUserName = useLoggedUserLogin();
    const voiceBuiltInSubject = sim2stateTopic && voiceUserName ? natsUserChatSubject(voiceUserName, sim2stateTopic) : null;
    const chatVoiceService = useMemo(
        () =>
            natsClient && (voiceTopicSubject || voiceBuiltInSubject)
                ? createPipelineVoiceService(natsClient, voiceTopicSubject, voiceBuiltInSubject)
                : null,
        [natsClient, voiceTopicSubject, voiceBuiltInSubject],
    );

    // Sync initial states with current states when they change
    useEffect(() => {
        if (state.initialSensorsState) setCurrentSensorsState(state.initialSensorsState);
    }, [state.initialSensorsState]);

    useEffect(() => {
        if (state.initialAssetsState) setCurrentAssetsState(state.initialAssetsState);
    }, [state.initialAssetsState]);

    useEffect(() => {
        if (state.initialGenericObjectsState) setCurrentGenericObjectsState(state.initialGenericObjectsState);
    }, [state.initialGenericObjectsState]);

    useEffect(() => {
        if (state.initialFemSimObjectsState) setCurrentFemSimulationObjectsState(state.initialFemSimObjectsState);
    }, [state.initialFemSimObjectsState]);

    // Valores del simulador como texto comparable: solo sus campos (los del formato del gemelo), en orden fijo
    const simulatorFields = useMemo(
        () => Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat ?? {}).sort(),
        [digitalTwinGltfData.digitalTwinSimulationFormat],
    );
    const simulatorValuesKey = useCallback(
        (values: unknown) => {
            let record = values as Record<string, unknown> | null | undefined;
            if (typeof values === "string") {
                try {
                    record = values ? JSON.parse(values) : null;
                } catch {
                    record = null;
                }
            }
            if (!record || typeof record !== "object") return "";
            return JSON.stringify(simulatorFields.map((field) => record?.[field] ?? null));
        },
        [simulatorFields],
    );
    const lastSimulatorValuesRef = useRef<string | null>(null);
    // the slide shown: the values its simulator sends carry it ("$slide"), and the answers with it go to its panels
    const shownSlideRef = useRef<string | null>(null);

    // 1. Send digital twin simulator state via NATS
    useLayoutEffect(() => {
        if (natsClient && opts.digitalTwinSimulatorState !== undefined) {
            if (digitalTwinModelNatsTopic && Object.keys(opts.digitalTwinSimulatorState).length !== 0) {
                if (state.digitalTwinSimulatorSendData) {
                    const natsSubject = digitalTwinModelNatsTopic.natsSubject;
                    const messageToSend = JSON.stringify(
                        shownSlideRef.current
                            ? { ...opts.digitalTwinSimulatorState, [SLIDE_FIELD]: shownSlideRef.current }
                            : opts.digitalTwinSimulatorState,
                    );
                    if (lastNatsMessageSent !== messageToSend) {
                        const h = headers();
                        h.set("Content-Type", "application/json");
                        h.set("Json-Structure", "object");
                        natsClient.publish(natsSubject, sc.encode(messageToSend), { headers: h });
                        setLastNatsMessageSent(messageToSend);
                    }
                } else {
                    // Aviso solo cuando el usuario cambia un valor del simulador sin bloquear la lectura de los
                    // sensores. Se comparan solo los campos del simulador, en un orden fijo: el estado inicial
                    // (último mensaje) puede traer otros campos (timestamp) o en otro orden, y antes el aviso
                    // salía cada vez que se volvía a evaluar este efecto, p. ej. al abrir el panel del asistente.
                    const current = simulatorValuesKey(opts.digitalTwinSimulatorState);
                    const previous = lastSimulatorValuesRef.current;
                    if (
                        previous !== null &&
                        current !== previous &&
                        current !== simulatorValuesKey(state.initialDigitalTwinSimulatorState) &&
                        current !== simulatorValuesKey(lastNatsMessageSent) &&
                        !(chatVisible || state.activeViewer === "pipeline")
                    ) {
                        toast.warning(
                            "To send these values to the digital twin, start the simulation in the Simulator panel.",
                            { toastId: "simulator-locked-warning" },
                        );
                    }
                }
                lastSimulatorValuesRef.current = simulatorValuesKey(opts.digitalTwinSimulatorState);
            }
        }
    }, [
        natsClient,
        opts.digitalTwinSimulatorState,
        state.digitalTwinSimulatorSendData,
        digitalTwinModelNatsTopic,
        lastNatsMessageSent,
        state.initialDigitalTwinSimulatorState,
        chatVisible,
        state.showDtSimulatorModal,
        state.activeViewer,
    ]);

    // Lo que contiene el visor, para el AI Agent (en una ref: si cambia no se reenvía la última pregunta)
    const viewerContentsRef = useRef(viewerContents({}));
    viewerContentsRef.current = viewerContents({
        sensorCollectionNames: state.sensorCollectionNames,
        assetCollectionNames: state.assetCollectionNames,
        animatedObjectNames: Object.keys(opts.animatedObjectsVisibilityState ?? {}),
        genericObjectCollectionNames: state.genericObjectCollectionNames,
        femSimObjectCollectionNames: state.femSimObjectCollectionNames,
        femResultNames: state.femResultNames,
        simulationFormat: digitalTwinGltfData.digitalTwinSimulationFormat,
        simulatorState: opts.digitalTwinSimulatorState,
        slideId: digitalTwinGltfData.gltfFile ? digitalTwinGltfData.slideId : undefined,
    });

    // 2. Send chat assistant messages via NATS, on the user's own copy of the sim2llm topic: pipelines takes
    // from it who asks (the "userName" field is only informative) and sends the answer to the user's inbox
    // Solo se envía la pregunta que el usuario acaba de añadir, una vez: no al cargar el historial ni al cambiar
    // de pestaña en el panel del asistente (antes, al abrir y cerrar el chat se volvía a enviar la última pregunta)
    const promptUserName = useLoggedUserLogin();
    const lastSentMessageRef = useRef<unknown>(null);
    const prevChatLengthRef = useRef(chatMessages.length);
    useLayoutEffect(() => {
        const prevLength = prevChatLengthRef.current;
        prevChatLengthRef.current = chatMessages.length;
        if (natsClient && promptUserName) {
            if (digitalTwinModelChatAssistantTopic) {
                const natsSubject = natsUserChatSubject(promptUserName, digitalTwinModelChatAssistantTopic.natsSubject);
                const lastMessage = chatMessages[chatMessages.length - 1];
                const sentAt = lastMessage ? Date.parse(lastMessage.time) : NaN;
                const isNewQuestion =
                    !!lastMessage &&
                    lastMessage !== lastSentMessageRef.current &&
                    chatMessages.length === prevLength + 1 &&
                    (Number.isNaN(sentAt) || Date.now() - sentAt < 60_000);
                // las preguntas de voz transcritas en el pipeline ya las ha enviado él al AI Agent
                if (isNewQuestion && lastMessage.sender === "user" && lastMessage.source !== "pipeline") {
                    lastSentMessageRef.current = lastMessage;
                    // timeZone: the AI agent writes the times in the user's zone (the
                    // group's when the question comes without it, e.g. from Telegram)
                    // viewer: what the 3D viewer holds, so that the AI agent names it exactly in uiOpts
                    // attachments: only the references of the images (they are in the bucket, chatAttachments.ts)
                    const messageToSend = JSON.stringify({
                        userName: chatMessages[chatMessages.length - 1].userName,
                        message: chatMessages[chatMessages.length - 1].message,
                        timeZone: userTimeZone,
                        viewer: viewerContentsRef.current,
                        ...(lastMessage.attachments?.length ? { attachments: lastMessage.attachments } : {}),
                    });
                    const h = headers();
                    h.set("Content-Type", "application/json");
                    h.set("Json-Structure", "object");
                    natsClient.publish(natsSubject, sc.encode(messageToSend), { headers: h });
                }
            }
        }
    }, [natsClient, chatMessages, digitalTwinModelChatAssistantTopic, userTimeZone, promptUserName]);

    // Pregunta de voz (sensor "Mobile audio", nota de voz de Telegram) transcrita por el pipeline: llega por
    // llm2sim con el campo "transcription" y el pipeline ya la ha enviado al AI Agent, así que aquí solo se
    // muestra, en todos los visores abiertos (la respuesta del AI Agent también les llega a todos). Antes la
    // enviaba cada visor y, con el gemelo abierto en dos pestañas o dispositivos, el AI Agent contestaba dos
    // veces. El chat se abre solo en el visor de quien la hizo. La suscripción NATS conserva el primer
    // manejador, por eso el usuario se lee de una ref.
    // Abre el panel del asistente en la pestaña del chat (en una ref: la suscripción NATS conserva el primer manejador)
    const openChatTabRef = useRef<() => void>(() => {});
    openChatTabRef.current = () => {
        if (!chatEnabled) return;
        if (state.activeViewer === "pipeline" && !showOnlyPipelineViewer) return;
        // in the pipeline view the assistant panel takes the place of the logs (both dock on the right)
        const inPipeline = state.activeViewer === "pipeline";
        setState((prev) =>
            prev.isAssistantPanelOpen && prev.isChatAssistantOpen && !(inPipeline && prev.isPipelineLogsOpen)
                ? prev
                : {
                      ...prev,
                      isAssistantPanelOpen: true,
                      isChatAssistantOpen: true,
                      isPipelineLogsOpen: inPipeline ? false : prev.isPipelineLogsOpen,
                  },
        );
    };
    const loggedUserName = useLoggedUserLogin();
    const loggedUserNameRef = useRef(loggedUserName);
    loggedUserNameRef.current = loggedUserName;
    const handleChatNatsMessage = useCallback(
        (newMessage: LlmMessage) => {
            if (newMessage.sender !== "user") {
                handleUpdateChatAssistantMessages(newMessage);
                // sin el chat a la vista: punto en la pestaña del chat y aviso con un botón para abrirlo
                if (newMessage.sender === "assistant" && !chatVisibleRef.current && (newMessage.message ?? "").trim()) {
                    setChatUnread(true);
                    toast.info(
                        ({ closeToast }) => (
                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span>OSI has answered in the chat</span>
                                <button
                                    type="button"
                                    style={{
                                        marginLeft: "auto",
                                        padding: "4px 10px",
                                        border: 0,
                                        borderRadius: 6,
                                        background: "#3d82f0",
                                        color: "#fff",
                                        cursor: "pointer",
                                        font: "500 12px Roboto, Arial, sans-serif",
                                    }}
                                    onClick={() => {
                                        openChatTabRef.current();
                                        closeToast?.();
                                    }}
                                >
                                    Open chat
                                </button>
                            </span>
                        ),
                        { toastId: "chat-answer-unread", autoClose: 6000 },
                    );
                }
                return;
            }
            const text = (newMessage.message ?? "").trim();
            // una foto enviada a Telegram puede venir sin texto
            if (text === "" && !newMessage.attachments?.length) return;
            const author = newMessage.userName || loggedUserNameRef.current;
            setChatMessages((prev) => [
                ...prev,
                {
                    userName: author,
                    message: text,
                    sender: "user",
                    time: new Date().toISOString(),
                    mcpToolCalls: [],
                    source: "pipeline",
                    // canal por el que llegó (móvil, Telegram)
                    ...(newMessage.via ? { via: newMessage.via } : {}),
                    ...(newMessage.attachments?.length ? { attachments: newMessage.attachments } : {}),
                },
            ]);
            if (author === loggedUserNameRef.current) openChatTabRef.current();
        },
        [handleUpdateChatAssistantMessages, setChatMessages, setState],
    );

    // the pipeline logs (dtmlog) only for the editors and administrators of the group (README, "Permissions";
    // auth_callout denies them to a Viewer)
    const canSeePipelineLogs =
        !!digitalTwinSelected && groupsManagedTable.some((group) => group.id === digitalTwinSelected.groupId);
    // the slide of the model shown: the messages of other slides do not move it
    const modelSlideRef = useRef<string | undefined>(undefined);
    modelSlideRef.current = digitalTwinGltfData.gltfFile ? digitalTwinGltfData.slideId : undefined;
    useNatsSubscription(
        natsClient,
        digitalTwinGltfData?.natsSubjectsData
            ?.filter((subject) => canSeePipelineLogs || subject.topicRef !== "dtmlog")
            .map((subject) => subject.natsSubject)
            .filter(filterNatsSubject) || [],
        digitalTwinGltfData?.natsSubjectsData || [],
        digitalTwinGltfData?.topicIdBySensorRef || {},
        currentSensorsState,
        currentAssetsState,
        currentGenericObjectsState,
        currentFemSimulationObjectsState,
        state.digitalTwinSimulatorSendData,
        state.sensorObjects,
        state.assetObjects,
        state.genericObjects,
        state.femSimulationObjects,
        setCurrentAssetsState,
        setCurrentSensorsState,
        setCurrentGenericObjectsState,
        setCurrentFemSimulationObjectsState,
        state.femResultData,
        (date) => setState((prev) => ({ ...prev, femResFilesLastUpdate: date })),
        digitalTwinGltfData?.isGroupDTDemo || false,
        (digitalTwinState) =>
            setState((prev) => ({
                ...prev,
                digitalTwinState: resolveSetStateAction(digitalTwinState, prev.digitalTwinState),
            })),
        handleImageUrlChange,
        handleChatNatsMessage,
        handleUpdateLogMessages,
        handlePipelineStatusChange,
        handlePipelineLeaderReplicaIndexChange,
        handleSetChatMessages,
        loggedUserName,
        modelSlideRef,
    );

    const [pipelineNodes, setPipelineNodes] = useState([] as IPipelineNode[]);
    const [pipelineEdges, setPipelineEdges] = useState([] as IPipelineEdge[]);

    useEffect(() => {
        if (digitalTwinSelected) {
            // cambios del pipeline sin desplegar que el usuario tenía antes de salir del visor
            const unsaved = getViewerMemory(dtUid).pipeline;
            if (unsaved?.changed) {
                setPipelineNodes(
                    unsaved.nodes.map((node) =>
                        node.type === "Inject"
                            ? {
                                  ...node,
                                  data: { ...node.data, natsClient, natsSubjectsData: digitalTwinGltfData.natsSubjectsData },
                              }
                            : node,
                    ),
                );
                setPipelineEdges(unsaved.edges);
                return;
            }
            const { nodes, edges } = processInitialPipelineData(
                digitalTwinSelected,
                natsClient,
                digitalTwinGltfData.natsSubjectsData,
            );
            setPipelineNodes(nodes);
            setPipelineEdges(edges);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digitalTwinSelected, natsClient, digitalTwinGltfData.natsSubjectsData]);

    useEffect(() => {
        rememberViewer(dtUid, {
            pipeline: state.isPipelineUiChanged
                ? { nodes: pipelineNodes, edges: pipelineEdges, changed: true }
                : undefined,
        });
    }, [dtUid, pipelineNodes, pipelineEdges, state.isPipelineUiChanged]);

    useEffect(() => {
        if (digitalTwinSelected) {
            if (sensorWithCameraSelected) {
                // opened from a camera: its image full page (the 3D model one click away)
                handlers.handleSetActiveViewer("3D");
                setMaximizeFirstImage(true);
            } else if (!viewerAvailable || (!twinHasModels && !viewerHasImage && dtScope === "asset")) {
                // nothing to see yet: the pipeline (an editor has the Viewer page one click away)
                handlers.handleSetActiveViewer("pipeline");
            } else if (dtScope !== "asset") {
                // a control room or the organization overview: they open with their panels
                handlers.handleSetActiveViewer("3D");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digitalTwinSelected, sensorWithCameraSelected, dtScope]);

    // El editor de pipelines (Flow) registra aquí la función que coloca con el ratón los nodos importados
    const pipelineImportRef = useRef<((nodes: any[], edges: any[]) => void) | null>(null);

    // Pipeline logs: only in the pipeline view, docked on the right (width kept while the app is open)
    const logsShown =
        !!digitalTwinSelected && canSeePipelineLogs && state.isPipelineLogsOpen && state.activeViewer === "pipeline";

    // The Viewer page: panels on a grid (Workspace/), below the top bar (it wraps on narrow pages) and left of
    // the assistant panel. The layout: the user's temporary one, else the group's (admin_api), else automatic.
    const [topBarHeight, setTopBarHeight] = useState(52);
    const viewerRightInset = assistantPanelShown ? assistantPanelWidth + 2 * VIEWER_GAP : VIEWER_GAP;
    const panelsTop = VIEWER_GAP + Math.round(topBarHeight) + VIEWER_GAP;
    const inViewer = state.activeViewer === "3D";
    // A low screen (a phone held sideways): the bars above the panels would leave them no room, so the viewer
    // is made taller than the screen and the page scrolls. Its height lets the panels fill the whole visible area
    // once the bars have scrolled out of sight.
    const lowScreen = useMediaQuery(`(max-height: ${VIEWER_LOW_SCREEN_BELOW - 1}px)`);
    const [scrollMinHeight, setScrollMinHeight] = useState<number | undefined>(undefined);
    useEffect(() => {
        const page = canvasContainerRef.current?.parentElement;
        if (!lowScreen || !inViewer || !page) {
            setScrollMinHeight(undefined);
            return;
        }
        const update = () => setScrollMinHeight(Math.round(page.clientHeight + panelsTop - VIEWER_GAP));
        update();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        observer.observe(page);
        return () => observer.disconnect();
    }, [lowScreen, inViewer, panelsTop, canvasContainerRef]);
    const [savedLayout, setSavedLayout] = useState<SavedViewerLayout | null>(null);
    const [draftLayout, setDraftLayout] = useState<WorkspaceLayout | null>(null);
    const [layoutSaving, setLayoutSaving] = useState(false);
    // a viewer configuration file being loaded (its dialog), and the lighting it brought while the layout is
    // edited: "Save for the group" saves it for the twin, Cancel puts back the one before
    // a configuration file being loaded: a .zip also brings images (and the twin's own, to tell which it replaces)
    const [configLoad, setConfigLoad] = useState<{
        fileName: string;
        result: ParsedViewerConfig | { error: string };
        images?: PackageImage[];
        ignored?: string[];
        twinImages?: string[] | null;
    } | null>(null);
    // the images of a .zip loaded and not saved yet: the Picture panels show them; saving uploads them
    const [pendingImages, setPendingImages] = useState<PackageImage[] | null>(null);
    const [configLighting, setConfigLighting] = useState<{ before: LightingOptions } | null>(null);
    const [workspacePhone, setWorkspacePhone] = useState(false);
    const [maximizeFirstImage, setMaximizeFirstImage] = useState(false);
    // the editors and administrators of the group (README, "Permissions") save the layout for the whole group, act on
    // the alarms and requests and edit the pipeline; the viewers change the layout only for themselves
    const canSaveLayout =
        !!digitalTwinSelected && groupsManagedTable.some((group) => group.id === digitalTwinSelected.groupId);
    const layoutAuth = useMemo(
        () => ({ accessToken, refreshToken, authDispatch }),
        [accessToken, refreshToken, authDispatch],
    );
    // adjuntos del chat: si el grupo los permite se pueden enviar imágenes; las de los mensajes se ven siempre
    const [chatAttachmentService, setChatAttachmentService] = useState<ChatAttachmentService | null>(null);
    const chatAttachmentsGroupId = digitalTwinSelected?.groupId;
    const chatAttachmentsDtId = digitalTwinSelected?.id;
    useEffect(() => {
        setChatAttachmentService(null);
        if (!chatEnabled || chatAttachmentsGroupId === undefined || chatAttachmentsDtId === undefined) return;
        let cancelled = false;
        fetchChatAttachmentsConfig(chatAttachmentsGroupId, chatAttachmentsDtId, layoutAuth).then((config) => {
            if (cancelled || !config) return;
            setChatAttachmentService(
                makeChatAttachmentService(chatAttachmentsGroupId, chatAttachmentsDtId, config, layoutAuth),
            );
        });
        return () => {
            cancelled = true;
        };
    }, [chatEnabled, chatAttachmentsGroupId, chatAttachmentsDtId, layoutAuth]);
    useEffect(() => {
        if (!digitalTwinSelected) return;
        let cancelled = false;
        fetchViewerLayout(digitalTwinSelected.groupId, digitalTwinSelected.id, layoutAuth).then((saved) => {
            if (!cancelled) setSavedLayout(saved);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digitalTwinSelected?.id]);
    const workspaceContext = useMemo(
        () => ({
            // the automatic layout shows a 3D model only when the twin has one; a 3D Model panel can be added to any
            // slide of an asset's twin (empty, its editors load the slide's model in it)
            hasModel: dtScope === "asset" && twinHasModels,
            modelPanels: dtScope === "asset" && (twinHasModels || canSaveLayout),
            hasCamera: viewerHasImage,
            controlRoom: dtScope === "group",
            organization: dtScope === "organization",
            // the simulator floats over the automatic layout, and over the layouts saved before simulator panels
            hasSimulator: dtScope === "asset" && Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat ?? {}).length > 0,
        }),
        [twinHasModels, canSaveLayout, viewerHasImage, dtScope, digitalTwinGltfData.digitalTwinSimulationFormat],
    );
    const { layout: shownLayout, origin: layoutOrigin } = useMemo(
        () => effectiveWorkspaceLayout(localLayout, savedLayout?.layout, workspaceContext),
        [localLayout, savedLayout, workspaceContext],
    );
    const editingLayout = draftLayout !== null;
    const workspaceLayout = draftLayout ?? shownLayout;
    const currentSlide = currentSlideOf(workspaceLayout, slideId, hiddenSlides);
    // the 3D model shown is that of the slide shown (DigitalTwin3DViewer loads it); a slide without a 3D Model panel
    // keeps the last one
    const currentSlideHasModelPanel = currentSlide.panels.some((panel) => panel.type === "model");
    shownSlideRef.current = currentSlide.id;
    // the simulator of the slide shown, with its own format or the twin's (DigitalTwin3DViewer gives it as the
    // twin's data's format: the sliders, the values sent and what the AI agent is told follow it)
    const slideSimulatorFormat = currentSlide.panels.find((panel) => panel.type === "simulator")?.format ?? null;
    const slideSimulatorFormatKey = slideSimulatorFormat ? JSON.stringify(slideSimulatorFormat) : "";
    useEffect(() => {
        onSlideSimulatorFormat?.(slideSimulatorFormat);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSlideSimulatorFormat, slideSimulatorFormatKey]);
    useEffect(() => {
        onShownSlide?.(currentSlideHasModelPanel ? currentSlide.id : null);
    }, [onShownSlide, currentSlide.id, currentSlideHasModelPanel]);
    // the scene is loaded when some slide shows the model
    const layoutHasModel = workspaceLayout.slides.some((slide) => slide.panels.some((panel) => panel.type === "model"));
    const goToSlide = useCallback((id: string) => {
        setSlideId(id);
        setMaximizedPanel(null);
    }, []);
    // all the slides as thumbnails (search, order)
    const [slidesOverview, setSlidesOverview] = useState(false);
    // opened from a camera: its image full page (the other panels one click away)
    useEffect(() => {
        if (!maximizeFirstImage) return;
        const slide = shownLayout.slides.find((sl) => sl.panels.some((panel) => panel.type === "image"));
        const image = slide?.panels.find((panel) => panel.type === "image");
        if (slide && image) {
            setHiddenSlides((ids) => ids.filter((id) => id !== slide.id));
            setSlideId(slide.id);
            setMaximizedPanel(image.id);
        }
        setMaximizeFirstImage(false);
    }, [maximizeFirstImage, shownLayout]);
    // the topics an Image panel can show, and those that have sent images
    const [liveImageSources, setLiveImageSources] = useState<string[]>([]);
    useEffect(() => frameStore.subscribeSources(setLiveImageSources), [frameStore]);
    const imageSources = useMemo(() => {
        const refs = (digitalTwinGltfData?.natsSubjectsData ?? [])
            .filter((data) => data.natsSubject && isImageTopicRef(data.topicRef))
            .map((data) => data.topicRef);
        return imageSourceOptions(refs, liveImageSources);
    }, [digitalTwinGltfData?.natsSubjectsData, liveImageSources]);
    // the device topics shown by some Image panel: the viewer listens to them only then
    const shownDeviceImages = useMemo(() => deviceImageSources(workspaceLayout), [workspaceLayout]);
    useDeviceImages(natsClient, digitalTwinGltfData?.natsSubjectsData ?? [], shownDeviceImages, handleImageUrlChange);

    // the fields of the asset's sensors a chart panel can show, and how it reads them
    const chartOptions = useMemo(
        () => chartSeriesOptions(sensorsTable as any, (sensorTypesTable ?? []) as any, digitalTwinSelected?.assetId),
        [sensorsTable, sensorTypesTable, digitalTwinSelected?.assetId],
    );
    const historyApi = useMemo(() => historyPanelApi(layoutAuth), [layoutAuth]);
    const loadAssetState = useMemo(() => assetStateApi(layoutAuth), [layoutAuth]);
    const loadControlRoom = useMemo(() => controlRoomApi(layoutAuth), [layoutAuth]);
    const loadControlRoomLogs = useMemo(() => controlRoomLogsApi(layoutAuth), [layoutAuth]);
    const loadOrgOverview = useMemo(() => orgOverviewApi(layoutAuth), [layoutAuth]);
    // the subjects of a control room (states, pipelines' status and logs), with the JSON of each message
    const controlRoomLive = useMemo(() => {
        if (!natsClient || !dtGroup?.groupUid) return undefined;
        const listen = (subject: string, onMessage: (data: unknown) => void) => {
            const sub = natsClient.subscribe(subject);
            (async () => {
                for await (const msg of sub) {
                    let data: unknown = null;
                    try {
                        data = JSON.parse(new TextDecoder().decode(msg.data));
                    } catch {
                        // not JSON
                    }
                    onMessage(data);
                }
            })().catch(() => undefined);
            return () => sub.unsubscribe();
        };
        return { groupUid: dtGroup.groupUid, listen };
    }, [natsClient, dtGroup?.groupUid]);
    // the changes of the asset's state that pipelines tells (NATS): the Asset state panel reads it at once
    const assetStateLive = useMemo(() => {
        if (!natsClient || !dtGroup?.groupUid) return undefined;
        const watch = (subject: string, onMessage: () => void) => {
            const sub = natsClient.subscribe(subject);
            (async () => {
                for await (const _msg of sub) onMessage();
            })().catch(() => undefined);
            return () => sub.unsubscribe();
        };
        return { groupUid: dtGroup.groupUid, watch };
    }, [natsClient, dtGroup?.groupUid]);
    // the group's administrators manage the alarms and requests from their panels, by the pipeline (as the
    // Alarms and Approvals pages: on the twin's approval subject, as the user)
    const historyActions = useMemo<HistoryActions | undefined>(() => {
        const subject = approvalSubject(digitalTwinGltfData?.natsSubjectsData);
        if (!canSaveLayout || !natsClient || !subject || !loggedUserName) return undefined;
        const run = async (what: () => Promise<void>, describe: (e: unknown) => string) => {
            try {
                await what();
            } catch (e) {
                throw new Error(describe(e));
            }
        };
        return {
            acknowledge: (nodeUid, key) => run(() => acknowledgeAlarms(natsClient, loggedUserName, subject, nodeUid, key), describeAlarmError),
            shelve: (nodeUid, key, minutes) => run(() => shelveAlarms(natsClient, loggedUserName, subject, nodeUid, minutes, key), describeAlarmError),
            reset: (nodeUid, key) => run(() => resetAlarms(natsClient, loggedUserName, subject, nodeUid, key), describeAlarmError),
            decide: (nodeUid, requestId, approve, comment) =>
                run(() => decideApprovalRequest(natsClient, loggedUserName, subject, nodeUid, requestId, approve, comment), describeApprovalError),
        };
    }, [canSaveLayout, natsClient, loggedUserName, digitalTwinGltfData?.natsSubjectsData]);
    // the viewer configuration (.json): the layout shown (the one being edited, if any) and the lighting shown
    // with the images of its Picture panels, a .zip
    const configImageNames = useMemo(() => layoutImageNames(workspaceLayout), [workspaceLayout]);
    // the viewer configuration as a file: a .json, or a .zip with the images of its Picture panels
    const buildConfigFile = async (): Promise<DataFile> => {
        const now = new Date();
        const config = buildViewerConfig({
            layout: workspaceLayout,
            lighting: lightingOf(opts),
            digitalTwinUid: digitalTwinSelected?.digitalTwinUid,
            description: digitalTwinSelected?.description,
            now,
        });
        const fileName = viewerConfigFileName(digitalTwinSelected?.digitalTwinUid, now);
        if (configImageNames.length === 0 || !digitalTwinSelected) {
            return { name: fileName, data: new Blob([viewerConfigText(config)], { type: "application/json" }) };
        }
        const images: PackageImage[] = [];
        const missing: string[] = [];
        for (const name of configImageNames) {
            const data = await viewerImageBytes(digitalTwinSelected.groupId, digitalTwinSelected.id, name, layoutAuth);
            if (data) images.push({ fileName: name, data });
            else missing.push(name);
        }
        if (missing.length > 0) toast.warning(`Images not found, left out of the zip: ${missing.join(", ")}`);
        const zip = buildViewerPackage("viewer_config.json", viewerConfigText(config), images);
        return { name: fileName.replace(/\.json$/i, "") + ".zip", data: new Blob([zip as BlobPart], { type: "application/zip" }) };
    };
    const downloadConfig = async () => {
        const file = await buildConfigFile();
        downloadBlob(file.data, file.name);
    };

    // ---------------------------------------------------------------------------------------------------------
    // Viewer data (viewerData.ts): load the .zip of all of it (or loose parts), download it all or a part
    const viewerDataInputRef = useRef<HTMLInputElement>(null);
    const [viewerDataLoad, setViewerDataLoad] = useState<{ set: ViewerDataSet; source: string } | null>(null);
    const [viewerDataStates, setViewerDataStates] = useState<ItemState[] | null>(null);
    const [viewerDataBusy, setViewerDataBusy] = useState<string | null>(null);
    const [femCount, setFemCount] = useState<number | null>(null);
    const twinRef = digitalTwinSelected ? { groupId: digitalTwinSelected.groupId, digitalTwinId: digitalTwinSelected.id } : null;
    // the slide whose 3D model is shown: its files (each slide has its own model and FEM results)
    const modelSlideId = viewerHasModel ? digitalTwinGltfData.slideId : undefined;
    const slideRef = twinRef && modelSlideId ? { ...twinRef, slideId: modelSlideId } : null;
    const readFemCount = () => {
        if (!slideRef) return;
        void listFemResults(slideRef, layoutAuth).then((list) => setFemCount(list.length));
    };
    // the slide where a model is loaded from its panel (the empty 3D Model panel, or the Files tab of its settings)
    const slideModelInput = useRef<HTMLInputElement>(null);
    const [modelLoadSlide, setModelLoadSlide] = useState<string | null>(null);
    const openViewerDataPicker = () => viewerDataInputRef.current?.click();
    // the Viewer data menu takes the .zip of all the viewer data (every slide's model with it) and a configuration;
    // the panels take their own files: a 3D Model panel its slide's model and FEM results ("model"), the Simulator
    // its format ("panel")
    const onViewerDataFiles = async (files: File[], from: "menu" | "panel" | "model" = "menu") => {
        if (files.length === 0) return;
        setViewerDataBusy("Reading files…");
        setModelLoadSlide(from === "model" ? currentSlide.id : null);
        try {
            // a File is a Blob: nothing is read into memory here (the .zip is read entry by entry)
            const dataFiles: DataFile[] = files.map((file) => ({ name: file.name, data: file, lastModified: file.lastModified }));
            const set = await readViewerDataFiles(dataFiles, {
                loosePipeline: false,
                looseSimulator: from === "panel",
                looseModel: from === "model",
            });
            setViewerDataStates(null);
            setViewerDataLoad({ set, source: files.length === 1 ? files[0].name : `${files.length} files` });
        } catch (error) {
            toast.error(`The files could not be read: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setViewerDataBusy(null);
        }
    };
    const loadViewerData = async (items: ViewerDataItem[]) => {
        if (!twinRef || !viewerDataLoad) return;
        const all = viewerDataLoad.set.items;
        const states: ItemState[] = all.map((item) => ({ status: items.includes(item) ? "waiting" : "done" }));
        setViewerDataStates(states);
        setViewerDataBusy("Loading viewer data…");
        const { loaded } = await applyViewerData(twinRef, items, {
            auth: layoutAuth,
            // a model without a slide of its own (a .zip of an older version): the first slide with a 3D Model panel
            slideId:
                modelLoadSlide ??
                workspaceLayout.slides.find((slide) => slide.panels.some((panel) => panel.type === "model"))?.id,
            viewerSettings: digitalTwinSelected?.viewerSettings as Record<string, unknown> | null | undefined,
            onStep: (item, fraction) => {
                const i = all.indexOf(item);
                setViewerDataStates((current) => {
                    if (!current) return current;
                    const next = [...current];
                    // the previous one ended (loaded or not: applyViewerData says it at the end)
                    for (let j = 0; j < i; j++) if (next[j].status === "loading") next[j] = { status: "done" };
                    next[i] = { status: "loading", fraction };
                    return next;
                });
            },
        });
        setViewerDataStates(all.map((item) => (items.includes(item) ? { status: loaded.includes(item) ? "done" : "failed" } : { status: "done" })));
        setViewerDataBusy(null);
        if (loaded.length > 0) {
            refreshDigitalTwins();
            readFemCount();
            // the model, the FEM results, the layout and the formats come again with the twin
            onReloadDigitalTwin?.();
        }
    };
    const downloadFile = (file: DataFile) => downloadBlob(file.data, file.name);
    const percent = (fraction: number) => `${Math.round(Math.min(1, fraction) * 100)}%`;
    // the simulator format written in the Simulator panel: saved like a loaded file, then the twin is read again
    // the format of the slide's simulator (written in its panel, or uploaded): in the layout, with its slide; saved
    // for the group at once, or with the layout being edited
    const setSlideSimulatorFormat = (format: Record<string, SimulatorParameter>) => {
        const deck = draftLayout ?? shownLayout;
        const slide = deck.slides.find((sl) => sl.id === currentSlide.id);
        if (!slide) return;
        const next = replaceSlide(deck, setSimulatorFormat(slide, format));
        if (draftLayout) setDraftLayout(next);
        else changeSlides(next, currentSlide.id);
    };
    const saveEditedSimulatorFormat = async (format: Record<string, unknown>) => {
        const clean = sanitizeSimulatorFormat(format);
        if (!clean) return false;
        setSlideSimulatorFormat(clean);
        setSimulatorEditing(false);
        return true;
    };
    const uploadSlideSimulatorFormat = async (file: File) => {
        const text = await file.text();
        const format = sanitizeSimulatorFormat(simulatorFormatOf(text));
        if (!format) {
            toast.error(`${file.name}: each parameter needs label, units, minValue, maxValue, defaultValue and step (min < default ≤ max, step > 0)`);
            return;
        }
        setSlideSimulatorFormat(format);
        toast.success(`${file.name}: the simulator format of this slide`);
    };
    // the simulator format, from the Simulator panel
    const downloadSimulatorFormat = () => {
        const format = digitalTwinGltfData.digitalTwinSimulationFormat ?? {};
        if (Object.keys(format).length === 0) return;
        const uid = digitalTwinSelected?.digitalTwinUid ?? "digital_twin";
        downloadFile({ name: `simulator_format_${uid}.json`, data: new Blob([JSON.stringify(format, null, 2)], { type: "application/json" }) });
    };
    const downloadViewerDataPart = async (part: ViewerDataPart) => {
        if (!twinRef || !digitalTwinSelected) return;
        const uid = digitalTwinSelected.digitalTwinUid;
        if (part === "config") return downloadConfig();
        setViewerDataBusy(part === "model" ? "Downloading 3D model…" : "Downloading FEM results…");
        try {
            if (part === "model") {
                if (!slideRef) return;
                const model = await fetchModel(slideRef, digitalTwinGltfData.gltfFileName ?? "", layoutAuth, (f) =>
                    setViewerDataBusy(`Downloading 3D model… ${percent(f)}`),
                );
                if (model) downloadFile(model);
            } else if (part === "fem") {
                if (!slideRef) return;
                const files = await fetchFemResults(slideRef, layoutAuth);
                if (files.length === 1) downloadFile(files[0]);
                else if (files.length > 1) {
                    const zipped = await writeZip(files.map((f) => ({ path: f.name, data: f.data, deflate: f.data.size <= 50 * 1024 * 1024 })));
                    downloadFile({ name: `fem_results_${uid}.zip`, data: zipped });
                }
            }
        } finally {
            setViewerDataBusy(null);
        }
    };
    const downloadAllViewerData = async () => {
        if (!twinRef || !digitalTwinSelected) return;
        setViewerDataBusy("Preparing the zip…");
        try {
            const now = new Date();
            const config = await buildConfigFile();
            // the model and FEM results of every slide
            const slides: SlideFiles[] = [];
            const models = Object.entries(digitalTwinGltfData.slideModels ?? {});
            for (const [index, [slideId, info]] of models.entries()) {
                const ref = { ...twinRef, slideId };
                const step = `(${index + 1}/${models.length})`;
                const model = info.gltfFileName
                    ? await fetchModel(ref, info.gltfFileName, layoutAuth, (f) => setViewerDataBusy(`Downloading 3D models ${step}… ${percent(f)}`))
                    : null;
                setViewerDataBusy(`Downloading FEM results ${step}…`);
                const fem = info.femResults > 0 ? await fetchFemResults(ref, layoutAuth) : [];
                slides.push({ slideId, model, fem });
            }
            setViewerDataBusy("Preparing the zip…");
            const zip = await buildViewerDataZip(
                {
                    config,
                    slides,
                    // the twin's own format (those of the slides are in the layout of the configuration)
                    simulator: (digitalTwinGltfData.twinSimulationFormat ?? digitalTwinGltfData.digitalTwinSimulationFormat) as unknown as Record<string, unknown>,
                    pipelineYaml: pipelineYamlOf(digitalTwinSelected.pipelineFileData),
                },
                { digitalTwinUid: digitalTwinSelected.digitalTwinUid, description: digitalTwinSelected.description, now },
                (f) => setViewerDataBusy(`Preparing the zip… ${percent(f)}`),
            );
            downloadFile({ name: VIEWER_DATA_FILE_NAME(digitalTwinSelected.digitalTwinUid, now), data: zip });
        } catch (error) {
            toast.error(`The zip could not be made: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setViewerDataBusy(null);
        }
    };
    const removeViewerModel = async () => {
        if (!slideRef) return;
        setViewerDataBusy("Removing 3D model…");
        const ok = await removeTwinModel(slideRef, layoutAuth);
        setViewerDataBusy(null);
        if (ok) {
            toast.success("The 3D model has been removed");
            refreshDigitalTwins();
            onReloadDigitalTwin?.();
        }
    };
    const saveFemMax = async (max: number) => {
        if (!twinRef) return;
        if (await setMaxFemResults(twinRef, max, layoutAuth)) {
            toast.success(`The digital twin keeps its ${max} newest FEM result files`);
            refreshDigitalTwins();
            readFemCount();
        }
    };

    // ---------------------------------------------------------------------------------------------------------
    // The 3D model's settings, over the model in its panel: opened with the gear of the panel (also in full screen)
    const toggleModelSettings = () => {
        if (!modelSettingsOpen && state.lockReadingButtomLabel !== BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS) {
            // the simulator shows the last measurements, unless the reading is locked: then it keeps the values being
            // simulated (set in the Sim tab or by the AI agent)
            handlers.handleGetLastMeasurementsButton();
        }
        setModelSettingsOpen((open) => !open);
    };
    const panelActions = (panel: WorkspacePanel): PanelAction[] =>
        panel.type === "simulator"
            ? canSaveLayout
                ? [
                      {
                          label: simulatorEditing ? "Close the editor of the simulator format" : "Edit the simulator parameters",
                          icon: <Pencil aria-hidden="true" />,
                          active: simulatorEditing,
                          onClick: () => setSimulatorEditing((editing) => !editing),
                      },
                      {
                          label: "Upload a simulator format (.json or .yaml)",
                          icon: <Upload aria-hidden="true" />,
                          onClick: () => simulatorFormatInput.current?.click(),
                      },
                      ...(Object.keys(digitalTwinGltfData.digitalTwinSimulationFormat ?? {}).length > 0
                          ? [{ label: "Download the simulator format", icon: <Download aria-hidden="true" />, onClick: downloadSimulatorFormat }]
                          : []),
                  ]
                : []
            : panel.type === "model" && viewerHasModel
            ? [
                  {
                      label: modelSettingsOpen ? "Close the 3D model settings" : "3D model settings",
                      icon: <SlidersHorizontal aria-hidden="true" />,
                      active: modelSettingsOpen,
                      onClick: toggleModelSettings,
                  },
              ]
            : [];
    const modelSettingsView =
        modelSettingsOpen && viewerHasModel ? (
            <AssistantPanel
                placement="panel"
                fullWidth={workspacePhone}
                onClose={() => setModelSettingsOpen(false)}
                opts={opts}
                setOpts={setOpts}
                sensorObjects={state.sensorObjects}
                sensorCollectionNames={state.sensorCollectionNames}
                assetObjects={state.assetObjects}
                assetCollectionNames={state.assetCollectionNames}
                genericObjects={state.genericObjects}
                genericObjectCollectionNames={state.genericObjectCollectionNames}
                femSimulationObjects={state.femSimulationObjects}
                femSimObjectCollectionNames={state.femSimObjectCollectionNames}
                femResultDates={state.femResultDates}
                femResultNames={state.femResultNames}
                digitalTwinSimulationFormat={digitalTwinGltfData.digitalTwinSimulationFormat}
                getLastMeasurementsButtomLabel={state.getLastMeasurementsButtomLabel}
                lockReadingButtomLabel={state.lockReadingButtomLabel}
                handleGetLastMeasurementsButton={handlers.handleGetLastMeasurementsButton}
                handleLockReadMeasurementsButtonClick={handlers.handleLockReadMeasurementsButtonClick}
                twinLighting={savedTwinLighting}
                onSaveLighting={digitalTwinSelected && canSaveLayout ? handleSaveLighting : undefined}
                savingLighting={savingLighting}
                filesContent={
                    canSaveLayout ? (
                        <ModelFilesTab
                            model={digitalTwinGltfData.gltfFileName || null}
                            femCount={femCount}
                            femMax={Number(digitalTwinSelected?.maxNumResFemFiles) || 1}
                            busy={viewerDataBusy}
                            onShow={readFemCount}
                            onLoadFiles={(files) => void onViewerDataFiles(files, "model")}
                            onDownloadModel={() => void downloadViewerDataPart("model")}
                            onRemoveModel={() => void removeViewerModel()}
                            onDownloadFem={() => void downloadViewerDataPart("fem")}
                            onSetFemMax={(max) => void saveFemMax(max)}
                        />
                    ) : undefined
                }
            />
        ) : null;
    // a file chosen to load: a .json, or a .zip with the configuration and its images
    const openConfigFile = async (file: File) => {
        if (!isZipName(file.name)) {
            setConfigLoad({ fileName: file.name, result: parseViewerConfig(await file.text()) });
            return;
        }
        const read = readViewerPackage(new Uint8Array(await file.arrayBuffer()));
        if ("error" in read) {
            setConfigLoad({ fileName: file.name, result: read });
            return;
        }
        const load = { fileName: file.name, result: parseViewerConfig(read.configText), images: read.images, ignored: read.ignored, twinImages: null };
        setConfigLoad(load);
        if (digitalTwinSelected && read.images.length > 0) {
            const twinImages = (await listViewerImages(digitalTwinSelected.groupId, digitalTwinSelected.id, layoutAuth)).map((image) => image.fileName);
            setConfigLoad((current) => (current === load || current?.images === read.images ? { ...current, twinImages } : current));
        }
    };
    // the images of a .zip not saved: back to the twin's
    const dropPendingImages = () => {
        if (!pendingImages || !digitalTwinSelected) return;
        void setPendingViewerImages(digitalTwinSelected.groupId, digitalTwinSelected.id, null);
        setPendingImages(null);
    };
    const loadConfig = () => {
        if (!configLoad || "error" in configLoad.result) return;
        const { layout, lighting } = configLoad.result;
        if (digitalTwinSelected) {
            const images = configLoad.images ?? [];
            void setPendingViewerImages(digitalTwinSelected.groupId, digitalTwinSelected.id, images.length > 0 ? images : null);
            setPendingImages(images.length > 0 ? images : null);
        }
        setMaximizedPanel(null);
        setDraftLayout(layout ?? shownLayout);
        if (layout) setSlideId(layout.slides[0]?.id ?? null);
        if (lighting) {
            setConfigLighting((pending) => pending ?? { before: lightingOf(opts) });
            setOpts((prev) => ({ ...prev, ...lighting }));
        }
        setConfigLoad(null);
    };
    const cancelLayoutEdit = () => {
        dropPendingImages();
        if (configLighting) {
            const { before } = configLighting;
            setOpts((prev) => ({ ...prev, ...before }));
            setConfigLighting(null);
        }
        setDraftLayout(null);
    };
    const fetchChartSeries = useCallback(
        (query: TimeSeriesQuery, signal: AbortSignal) => fetchTimeSeries(query, layoutAuth, signal),
        [layoutAuth],
    );

    // The time of the page: while editing the layout it is the layout's (saved with it); otherwise the one
    // chosen now, else the layout's, else the last hour refreshed every 10 s
    const pageTime: PageTime = editingLayout ? (draftLayout?.time ?? localTime ?? DEFAULT_PAGE_TIME) : (localTime ?? shownLayout.time ?? DEFAULT_PAGE_TIME);
    const changePageTime = (time: PageTime) => {
        if (draftLayout) setDraftLayout(setLayoutTime(draftLayout, time));
        else setLocalTime(time);
    };
    // the refresh tick lives in a clock, not in this component's state: at every refresh only the chart
    // panels and the panel editor draw again (see PageClock)
    const refreshClock = useMemo(createRefreshClock, []);
    const refreshNow = refreshClock.bump;
    useEffect(() => {
        const every = refreshMs(pageTime.refresh);
        if (!every || !isLive(pageTime) || !inViewer) return;
        const timer = window.setInterval(() => {
            if (typeof document === "undefined" || !document.hidden) refreshClock.bump();
        }, every);
        return () => window.clearInterval(timer);
    }, [pageTime.refresh, pageTime.from, pageTime.to, inViewer]); // eslint-disable-line react-hooks/exhaustive-deps
    const hasCharts = workspaceLayout.slides.some((slide) => slide.panels.some((panel) => panel.type === "chart"));
    // the chart panel open in the editor (full page)
    const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
    const editingPanel = editingPanelId ? currentSlide.panels.find((panel) => panel.id === editingPanelId) ?? null : null;
    // the values of the NATS messages for the Text panels: the topics they name (all of them while one is edited,
    // so that its editor offers their fields)
    const liveStore = useMemo(createLiveValueStore, []);
    // the panels of the slide shown see its messages ("$slide") and those of no slide
    const slideLiveStore = useMemo(() => scopedToSlide(liveStore, currentSlide.id), [liveStore, currentSlide.id]);
    const twinLiveTopics = useMemo(() => liveTopicRefs(digitalTwinGltfData?.natsSubjectsData ?? []), [digitalTwinGltfData?.natsSubjectsData]);
    // the same topics with what is known of them: the fields of the sensors of each dev2pdb topic
    const liveTopics = useMemo(() => {
        const topicOfSensor: Record<string, string> = {};
        for (const sensor of (sensorsTable ?? []) as { sensorRef: string; topicRef: string }[]) topicOfSensor[sensor.sensorRef] = sensor.topicRef;
        return liveTopicsOf(digitalTwinGltfData?.natsSubjectsData ?? [], chartOptions, topicOfSensor);
    }, [digitalTwinGltfData?.natsSubjectsData, chartOptions, sensorsTable]);
    // the sounds the pipeline asks for (dtm2sim "sound"), while the user has the sound on
    const viewerSound = useViewerSounds(slideLiveStore, twinLiveTopics.includes(SOUND_TOPIC));
    const shownLiveTopics = useMemo(() => {
        const sounds = soundTopics(viewerSound.enabled, twinLiveTopics);
        if (editingPanel?.type === "markdown" || editingPanel?.type === "picture" || editingPanel?.type === "surface") return twinLiveTopics;
        const panels = workspaceLayout.slides.flatMap((slide) => slide.panels);
        const texts = panels.filter((p) => p.type === "markdown").map((p) => p.text ?? "");
        const animated = panels.flatMap((p) => (p.type === "picture" ? (p.bindings ?? []).map((b) => b.topicRef) : []));
        const surfaces = panels.flatMap((p) => (p.type === "surface" ? surfaceTopics(p.surface) : []));
        return Array.from(new Set([...topicRefsOf(texts), ...animated, ...surfaces, ...sounds])).sort();
    }, [editingPanel?.type, twinLiveTopics, workspaceLayout, viewerSound.enabled]);
    // the images of the Picture panels: files of the twin
    const pictureFiles = useMemo<PictureFiles | undefined>(() => {
        if (!digitalTwinSelected) return undefined;
        const { groupId, id } = digitalTwinSelected;
        return {
            load: (fileName) => loadViewerImage(groupId, id, fileName, layoutAuth),
            list: () => listViewerImages(groupId, id, layoutAuth),
            upload: (file, fileName) => uploadViewerImage(groupId, id, file, fileName, layoutAuth),
            remove: (fileName) => deleteViewerImage(groupId, id, fileName, layoutAuth),
            subscribe: (listener) => onViewerImageChange((g, dt, fileName) => g === groupId && dt === id && listener(fileName)),
        };
    }, [digitalTwinSelected, layoutAuth]);
    useLiveValues(natsClient, digitalTwinGltfData?.natsSubjectsData ?? [], shownLiveTopics, liveStore);

    const startLayoutEdit = useCallback(() => {
        setMaximizedPanel(null);
        setDraftLayout(shownLayout);
    }, [shownLayout]);
    // a chart opens in the editor; its changes go to the layout being edited
    const editPanel = (id: string) => {
        if (!draftLayout) startLayoutEdit();
        setEditingPanelId(id);
    };
    const applyPanel = (panel: WorkspacePanel) => {
        setDraftLayout((draft) => {
            const deck = draft ?? shownLayout;
            const slide = deck.slides.find((sl) => sl.id === currentSlide.id);
            return slide ? replaceSlide(deck, replacePanel(slide, panel)) : deck;
        });
        setEditingPanelId(null);
    };
    // Saving a layout without some slides, or without their 3D Model panels, removes their models' files: asked first
    const [modelRemoval, setModelRemoval] = useState<{ lost: LostModel[]; proceed: () => void } | null>(null);
    const checkModelRemoval = (next: WorkspaceLayout | null, proceed: () => void) => {
        const lost = lostModels(savedLayout?.layout ?? null, next, workspaceLayout, digitalTwinGltfData.slideModels);
        if (lost.length === 0) proceed();
        else setModelRemoval({ lost, proceed });
    };
    // the twin's models changed (admin_api removed those of the slides gone): read again
    const afterModelsRemoved = (removed: string[] | undefined) => {
        if (!removed || removed.length === 0) return;
        refreshDigitalTwins();
        onReloadDigitalTwin?.();
    };
    const saveLayoutForGroup = () => {
        if (!draftLayout) return;
        checkModelRemoval(draftLayout, () => void saveLayoutForGroupNow());
    };
    const saveLayoutForGroupNow = async () => {
        if (!digitalTwinSelected || !draftLayout) return;
        setLayoutSaving(true);
        // the images of a .zip first, so that the layout finds them (not those uploaded since by hand, under the
        // same name, from a Picture panel)
        if (pendingImages) {
            const { groupId, id } = digitalTwinSelected;
            const stillPending = pendingImages.filter((image) => isPendingViewerImage(groupId, id, image.fileName));
            const failed = await uploadViewerImages(groupId, id, stillPending, layoutAuth);
            if (failed.length > 0) {
                toast.error(`Images not uploaded: ${failed.join(", ")}. The layout is not saved.`);
                setLayoutSaving(false);
                return;
            }
            void setPendingViewerImages(digitalTwinSelected.groupId, digitalTwinSelected.id, null);
            setPendingImages(null);
        }
        // saved with simulator panels: from now on a simulator removed by the editor stays removed (withSimulatorPanel)
        const saved = await saveViewerLayout(digitalTwinSelected.groupId, digitalTwinSelected.id, { ...draftLayout, simulatorPlaced: true }, layoutAuth);
        // the lighting of a configuration file loaded, with the layout
        if (saved && configLighting) {
            const lighting = lightingOf(opts);
            if (await saveTwinLighting(digitalTwinSelected, lighting, accessToken, refreshToken, authDispatch)) {
                setSavedTwinLighting(lighting);
                setConfigLighting(null);
            }
        }
        setLayoutSaving(false);
        if (!saved) return;
        setSavedLayout(saved);
        setLocalLayout(null);
        setLocalTime(null);
        setDraftLayout(null);
        afterModelsRemoved(saved.removedSlideModels);
    };
    // the others: their changes stay while the viewer is open (none when they are the group's layout again)
    const finishLayoutEdit = () => {
        if (draftLayout) {
            const groupLayout = effectiveWorkspaceLayout(null, savedLayout?.layout, workspaceContext).layout;
            setLocalLayout(sameLayout(draftLayout, groupLayout) ? null : draftLayout);
        }
        setDraftLayout(null);
    };
    // administrators: back to the automatic layout for the group; the others: back to the group's layout
    const restoreLayout = () => {
        if (canSaveLayout) checkModelRemoval(null, () => void restoreLayoutNow());
        else void restoreLayoutNow();
    };
    const restoreLayoutNow = async () => {
        // the lighting and the images of a configuration file not saved go back too
        dropPendingImages();
        if (configLighting) {
            const { before } = configLighting;
            setOpts((prev) => ({ ...prev, ...before }));
            setConfigLighting(null);
        }
        if (canSaveLayout && digitalTwinSelected) {
            setLayoutSaving(true);
            const deleted = await deleteViewerLayout(digitalTwinSelected.groupId, digitalTwinSelected.id, layoutAuth);
            setLayoutSaving(false);
            if (!deleted) return;
            setSavedLayout({ layout: null });
            if (deleted === "models removed") afterModelsRemoved(["removed"]);
        }
        setLocalLayout(null);
        setDraftLayout(null);
    };
    // New, Duplicate and Delete slide out of the layout editing take effect at once: saved for the group by its
    // administrators, kept while the viewer is open by the others (as their layout changes are)
    const changeSlides = (next: WorkspaceLayout, goTo: string) => {
        if (canSaveLayout) checkModelRemoval(next, () => void changeSlidesNow(next, goTo));
        else void changeSlidesNow(next, goTo);
    };
    const changeSlidesNow = async (next: WorkspaceLayout, goTo: string) => {
        if (canSaveLayout && digitalTwinSelected) {
            setLayoutSaving(true);
            const saved = await saveViewerLayout(digitalTwinSelected.groupId, digitalTwinSelected.id, { ...next, simulatorPlaced: true }, layoutAuth);
            setLayoutSaving(false);
            if (!saved) return;
            setSavedLayout(saved);
            setLocalLayout(null);
            afterModelsRemoved(saved.removedSlideModels);
        } else {
            setLocalLayout(next);
        }
        goToSlide(goTo);
    };
    // A duplicated slide has its own copy of its source's model and FEM results (the group's editors and
    // administrators: the others' slides are only theirs, and show no model of their own)
    const duplicateCurrentSlide = async () => {
        const copy = duplicateSlide(draftLayout ?? shownLayout, currentSlide.id);
        if (copy.id === currentSlide.id) return;
        const source = digitalTwinGltfData.slideModels?.[currentSlide.id];
        if (source && canSaveLayout && twinRef) {
            setViewerDataBusy("Copying the 3D model…");
            const copied = await copySlideModel(twinRef, currentSlide.id, copy.id, layoutAuth);
            setViewerDataBusy(null);
            if (!copied) return;
            onReloadDigitalTwin?.();
        }
        if (draftLayout) {
            setDraftLayout(copy.layout);
            goToSlide(copy.id);
        } else changeSlides(copy.layout, copy.id);
    };
    // the Add panel dialog, opened from the slide bar
    const [addingPanel, setAddingPanel] = useState(false);
    // the simulator format, from the Upload icon of the Simulator panel's bar
    const simulatorFormatInput = useRef<HTMLInputElement>(null);
    const [logsWidth, setLogsWidth] = usePersistentState<number>("pipelineLogs.width", PIPELINE_LOGS_WIDTH);
    const pipelineLogsWidth = clampLogsWidth(logsWidth);
    // "Show in flow": Flow registers here the function that centres the canvas on a node
    const flowFocusRef = useRef<((uid: string, tone?: string) => boolean) | null>(null);
    const selectedNodesCount = useMemo(() => pipelineNodes.filter((node: any) => node.selected).length, [pipelineNodes]);
    const canShowInFlow = useCallback((uid: string) => pipelineNodes.some((node: any) => node.id === uid), [pipelineNodes]);
    const handleShowInFlow = useCallback(
        (uid: string, isError: boolean) => flowFocusRef.current?.(uid, isError ? "error" : "info"),
        [],
    );
    // Errors that arrived while the logs were not on screen: badge on the logs button and dot on the
    // Pipeline tab of the viewer selector
    const [unseenPipelineErrors, setUnseenPipelineErrors] = useState(0);
    const lastSeenLogRef = useRef<PipelineLog | undefined>(logMessages[logMessages.length - 1]);
    useEffect(() => {
        const last = logMessages[logMessages.length - 1];
        if (last === lastSeenLogRef.current) return;
        let newErrors = 0;
        for (let i = logMessages.length - 1; i >= 0 && logMessages[i] !== lastSeenLogRef.current; i--) {
            if (levelOf(logMessages[i]) === "error") newErrors++;
        }
        lastSeenLogRef.current = last;
        if (!logsShown && newErrors > 0) setUnseenPipelineErrors((n) => n + newErrors);
    }, [logMessages, logsShown]);
    useEffect(() => {
        if (logsShown) setUnseenPipelineErrors(0);
    }, [logsShown]);
    const handlePipelineImported = useCallback((importedNodes: any[], importedEdges: any[]) => {
        if (pipelineImportRef.current) {
            pipelineImportRef.current(importedNodes, importedEdges);
        } else {
            setPipelineNodes((nds: any[]) => nds.concat(importedNodes));
            setPipelineEdges((eds: any[]) => eds.concat(importedEdges));
            handlers.handlePipelineUiChanged(true);
            toast.success("YAML file loaded successfully");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const {
        handleDeployPipeline,
        handleStopPipeline,
        handleFileUpload,
        handleDownloadYamlFile,
        handleReinitiatePipeline,
    } = usePipelineActions(
        pipelineNodes,
        pipelineEdges,
        setPipelineNodes,
        setPipelineEdges,
        handlers.handlePipelineUiChanged,
        handlers.handleSetPipelineLogsOpen,
        natsClient,
        digitalTwinGltfData.natsSubjectsData,
        refreshDigitalTwins,
        {
            digitalTwinSelected,
            accessToken,
            refreshToken,
            authDispatch,
        },
        handlePipelineImported,
    );

    // The 3D model, rendered once and moved into the model panel of the slide shown (ModelSlot): changing the
    // slide does not reload the scene, and several slides can show the model.
    // a new scene for each model (the model of another slide, or a new upload): its objects are read again
    const modelKey = `${digitalTwinGltfData.slideId ?? ""}|${digitalTwinGltfData.digitalTwinGltfUrl ?? ""}`;
    const modelView = viewerHasModel ? (
                    <>
                    <div key={modelKey} style={{ position: "absolute", inset: 0 }} data-testid="viewer-model-canvas">
                    <Canvas
                        ref={canvasRef}
                        dpr={window.devicePixelRatio}
                        orthographic
                        shadows="percentage"
                        legacy={LEGACY_COLOR_MANAGEMENT}
                        gl={{
                            toneMapping: toneMappingOf(opts.toneMapping).three,
                            toneMappingExposure: opts.exposure,
                            outputColorSpace: THREE.SRGBColorSpace,
                        }}
                        camera={{ position: [4, 4, 0], zoom: 300 }}
                    >
                        {/* Opaque background, the colour of CanvasContainer. With the transparent canvas of R3F
                            (clear alpha 0), three.js fills what glass and liquids (KHR_materials_transmission)
                            see behind them with white at 50%, and they look milky. */}
                        {!environmentShowsAsBackground(opts) && (
                            <color
                                attach="background"
                                args={[
                                    // with post-processing the background is tone mapped too: the colour that
                                    // ends up as the container's
                                    opts.ambientOcclusion || opts.bloom
                                        ? backgroundUnderToneMapping(VIEWER_BACKGROUND_COLOR, opts.toneMapping, opts.exposure)
                                        : VIEWER_BACKGROUND_COLOR,
                                ]}
                            />
                        )}
                        <RendererLighting
                            toneMapping={opts.toneMapping}
                            exposure={opts.exposure}
                            effectsActive={!!(opts.ambientOcclusion || opts.bloom)}
                        />
                        <GlassTweaks thinGlass={!!opts.thinGlass} />
                        <ShaderPrewarm gltfData={digitalTwinGltfData} />
                        <Stage
                            controls={controlsRef}
                            environment={opts.environment}
                            environmentIntensity={opts.environmentIntensity}
                            environmentRotation={opts.environmentRotation}
                            environmentBackground={opts.environmentBackground}
                            backgroundBlur={opts.backgroundBlur}
                            keyLight={opts.keyLight}
                            keyLightIntensity={opts.keyLightIntensity}
                            keyLightFollowsCamera={opts.keyLightFollowsCamera}
                            contactShadows={opts.contactShadows}
                            ambientOcclusion={opts.ambientOcclusion}
                            bloom={opts.bloom}
                            bloomIntensity={opts.bloomIntensity}
                            toneMapping={opts.toneMapping}
                            ambientLight={opts.ambientLight}
                            ambientLightIntensity={opts.ambientLightIntensity}
                            spotLight={opts.spotLight}
                            spotLightPower={opts.spotLightPower}
                            showSpotLightHelper={opts.showSpotLightHelper}
                            pointLight={opts.pointLight}
                            pointLightPower={opts.pointLightPower}
                            showPointLightHelper={opts.showPointLightHelper}
                            shadows={opts.showShadows}
                            showAxes={opts.showAxes}
                            axesScale={opts.axesScale}
                            femResultLoaded={state.femResultLoaded}
                            initialView={
                                digitalTwinGltfData.slideId
                                    ? getViewerMemory(dtUid).cameras?.[digitalTwinGltfData.slideId]
                                    : memory.camera
                            }
                            onBounds={handleSceneBounds}
                        >
                            <Model
                                digitalTwinGltfData={digitalTwinGltfData}
                                sensorsInfo={sensorsInfo}
                                femResultData={state.femResultData}
                                sensorObjects={state.sensorObjects}
                                initialSensorsState={state.initialSensorsState ?? {}}
                                sensorsVisibilityState={opts.sensorsVisibilityState}
                                assetObjects={state.assetObjects}
                                initialAssetsState={state.initialAssetsState ?? {}}
                                assetsVisibilityState={opts.assetsVisibilityState}
                                animatedObjectsVisibilityState={opts.animatedObjectsVisibilityState}
                                femSimulationObjects={state.femSimulationObjects}
                                femSimulationGeneralInfo={state.femSimulationGeneralInfo ?? {}}
                                initialFemSimObjectsState={state.initialFemSimObjectsState}
                                femSimulationObjectsVisibilityState={opts.femSimulationObjectsVisibilityState}
                                femElemLabels={opts.femElemLabels}
                                femNodeLabels={opts.femNodeLabels}
                                genericObjects={state.genericObjects}
                                initialGenericObjectsState={state.initialGenericObjectsState ?? {}}
                                genericObjectsVisibilityState={opts.genericObjectsVisibilityState}
                                natsSubjectsData={digitalTwinGltfData.natsSubjectsData}
                                topicIdBySensorRef={digitalTwinGltfData.topicIdBySensorRef}
                                dashboardUrl={digitalTwinSelected?.dashboardUrl as string}
                                sensorsOpacity={opts.sensorsOpacity}
                                highlightAllSensors={opts.highlightAllSensors}
                                showAllSensorsMarker={opts.showAllSensorsMarker}
                                showOccludedSensorMarkers={opts.showOccludedSensorMarkers !== false}
                                hideAllSensors={opts.hideAllSensors}
                                assetsOpacity={opts.assetsOpacity}
                                highlightAllAssets={opts.highlightAllAssets}
                                hideAllAssets={opts.hideAllAssets}
                                animatedObjectsOpacity={opts.animatedObjectsOpacity}
                                highlightAllAnimatedObjects={opts.highlightAllAnimatedObjects}
                                hideAllAnimatedObjects={opts.hideAllAnimatedObjects}
                                femSimulationObjectsOpacity={opts.femSimulationObjectsOpacity}
                                hideAllFemSimulationObjects={opts.hideAllFemSimulationObjects}
                                showFemSimulationDeformation={opts.showFemSimulationDeformation}
                                highlightAllFemSimulationObjects={opts.highlightAllFemSimulationObjects}
                                showAllFemSimulationMeshes={opts.showAllFemSimulationMeshes}
                                genericObjectsOpacity={opts.genericObjectsOpacity}
                                genericObjectsShowDeepObjects={opts.genericObjectsShowDeepObjects}
                                highlightAllGenericObjects={opts.highlightAllGenericObjects}
                                hideAllGenericObjects={opts.hideAllGenericObjects}
                                canvasRef={canvasRef}
                                selectedObjTypeRef={selectedObjTypeRef}
                                selectedObjNameRef={selectedObjNameRef}
                                selectedObjCollectionNameRef={selectedObjCollectionNameRef}
                                femSimulationResult={opts.femSimulationResult}
                                femSimulationDefScale={opts.femSimulationDefScale}
                                digitalTwinSimulatorState={opts.digitalTwinSimulatorState}
                                digitalTwinSimulatorSendData={state.digitalTwinSimulatorSendData}
                                setFemMinValues={(values) =>
                                    setState((prev) => ({
                                        ...prev,
                                        femMinValues: resolveSetStateAction(values, prev.femMinValues),
                                    }))
                                }
                                setFemMaxValues={(values) =>
                                    setState((prev) => ({
                                        ...prev,
                                        femMaxValues: resolveSetStateAction(values, prev.femMaxValues),
                                    }))
                                }
                                setFemResFilesLastUpdate={(date) =>
                                    setState((prev) => ({ ...prev, femResFilesLastUpdate: date }))
                                }
                                initialDigitalTwinSimulatorState={state.initialDigitalTwinSimulatorState}
                                openDashboardTab={openDashboardTab}
                                setFemResultLoaded={(loaded) =>
                                    setState((prev) => ({ ...prev, femResultLoaded: loaded }))
                                }
                                femResultNames={state.femResultNames}
                                enableWebWorkes={opts.enableWebWorkes}
                                numWebWorkers={opts.numWebWorkers}
                                logElapsedTime={opts.logElapsedTime}
                                setDigitalTwinState={(state) =>
                                    setState((prev) => ({
                                        ...prev,
                                        digitalTwinState: resolveSetStateAction(state, prev.digitalTwinState),
                                    }))
                                }
                                chatMessages={chatMessages}
                                handleUpdateChatAssistantMessages={handleUpdateChatAssistantMessages}
                                isChatAssistantOpen={state.isChatAssistantOpen}
                                handleUpdateLogMessages={handleUpdateLogMessages}
                                showDtSimulatorModal={state.showDtSimulatorModal}
                                currentSensorsState={currentSensorsState}
                                currentAssetsState={currentAssetsState}
                                currentGenericObjectsState={currentGenericObjectsState}
                                currentFemSimulationObjectsState={currentFemSimulationObjectsState}
                                setCurrentSensorsState={setCurrentSensorsState}
                                setCurrentAssetsState={setCurrentAssetsState}
                                setCurrentGenericObjectsState={setCurrentGenericObjectsState}
                                setCurrentFemSimulationObjectsState={setCurrentFemSimulationObjectsState}
                            />
                        </Stage>
                        <CameraController
                            projection={opts.cameraProjection ?? "orthographic"}
                            fov={opts.cameraFov ?? 45}
                            controlsRef={controlsRef}
                            boundsRef={sceneBoundsRef}
                            followReleased={followReleased}
                            onFollowStatus={setFollowStatus}
                            onProjectionRequest={(projection) =>
                                setOpts((prev) => ({ ...prev, cameraProjection: projection }))
                            }
                            onFovRequest={(fov) => setOpts((prev) => ({ ...prev, cameraFov: fov }))}
                        />
                        <OrbitControls ref={controlsRef} mouseButtons={MOUSE_BUTTONS} />
                        <CameraMemory dtUid={dtUid} slideId={digitalTwinGltfData.slideId} controlsRef={controlsRef} />
                    </Canvas>
                    </div>
                    {followStatus.active && (
                        <FollowCameraBar role="status" aria-live="polite">
                            <Video aria-hidden="true" />
                            <span>{followReleased ? "External camera (not followed)" : "Following the external camera"}</span>
                            <button type="button" onClick={() => setFollowReleased((r) => !r)}>
                                {followReleased ? "Follow" : "Release"}
                            </button>
                        </FollowCameraBar>
                    )}
                    {/* the object under the mouse */}
                    <SelectedObjectInfoContainer $right={12} $bottom={12}>
                        <ObjectInfoContainer>
                            <ObjectInfo ref={selectedObjNameRef}>Name: -</ObjectInfo>
                            <ObjectInfo ref={selectedObjTypeRef}>Type: -</ObjectInfo>
                            <ObjectInfo ref={selectedObjCollectionNameRef}>Collection: -</ObjectInfo>
                        </ObjectInfoContainer>
                    </SelectedObjectInfoContainer>
                    {/* FEM results legend and min / max: over the 3D model, inside its panel (a maximized panel
                        covered them when they were outside) */}
                    {state.activeViewer === "3D" &&
                        state.femSimulationObjects.length !== 0 &&
                        state.femSimulationGeneralInfo &&
                        ((state.femResultData && opts.femSimulationResult !== "None result") ||
                            opts.legendToShow !== "None result") &&
                        !opts.hideFemSimulationLegend && (
                            <>
                                <SimulationLegend
                                    resultRenderInfo={
                                        state.femSimulationGeneralInfo[
                                            opts.femSimulationResult === "None result"
                                                ? opts.legendToShow
                                                : opts.femSimulationResult
                                        ]
                                    }
                                    canvasContainerRef={canvasContainerRef}
                                />
                                <MaxMinValuesContainer>
                                    <MaxMinFlexContainer>
                                        <FemMinValue ref={femMinValueRef}>Min value: 0</FemMinValue>
                                        <FemMaxValue ref={femMaxValueRef}>Max value: 0</FemMaxValue>
                                    </MaxMinFlexContainer>
                                </MaxMinValuesContainer>
                            </>
                        )}
                    </>
    ) : null;

    return (
        <>
            {modelView && layoutHasModel && createPortal(modelView, modelHost)}
            {digitalTwinSelected && digitalTwinGltfData && digitalTwinGltfData.digitalTwinGltfUrl && (
                <SetGltfObjects
                    key={modelKey}
                    digitalTwinGltfData={digitalTwinGltfData}
                    setSensorObjects={(objects) => setState((prev) => ({ ...prev, sensorObjects: objects }))}
                    setSensorCollectionNames={(names) =>
                        setState((prev) => ({ ...prev, sensorCollectionNames: names }))
                    }
                    setAssetObjects={(objects) => setState((prev) => ({ ...prev, assetObjects: objects }))}
                    setAssetCollectionNames={(names) => setState((prev) => ({ ...prev, assetCollectionNames: names }))}
                    setGenericObjects={(objects) => setState((prev) => ({ ...prev, genericObjects: objects }))}
                    setGenericObjectCollectionNames={(names) =>
                        setState((prev) => ({ ...prev, genericObjectCollectionNames: names }))
                    }
                    setFemSimulationObjects={(objects) =>
                        setState((prev) => ({ ...prev, femSimulationObjects: objects }))
                    }
                    setFemSimObjectCollectionNames={(names) =>
                        setState((prev) => ({ ...prev, femSimObjectCollectionNames: names }))
                    }
                    setInitialSensorsState={(state) => setState((prev) => ({ ...prev, initialSensorsState: state }))}
                    setInitialAssetsState={(state) => setState((prev) => ({ ...prev, initialAssetsState: state }))}
                    setInitialGenericObjectsState={(state) =>
                        setState((prev) => ({ ...prev, initialGenericObjectsState: state }))
                    }
                    setInitialGenericObjectsVisibilityState={(state) =>
                        setState((prev) => ({ ...prev, initialGenericObjectsVisibilityState: state }))
                    }
                    setInitialSensorsVisibilityState={(state) =>
                        setState((prev) => ({ ...prev, initialSensorsVisibilityState: state }))
                    }
                    setInitialAssetsVisibilityState={(state) =>
                        setState((prev) => ({ ...prev, initialAssetsVisibilityState: state }))
                    }
                    setInitialFemSimObjectsVisibilityState={(state) =>
                        setState((prev) => ({ ...prev, initialFemSimObjectsVisibilityState: state }))
                    }
                    setInitialDigitalTwinSimulatorState={(state) =>
                        setState((prev) => ({
                            ...prev,
                            initialDigitalTwinSimulatorState: resolveSetStateAction(
                                state,
                                prev.initialDigitalTwinSimulatorState,
                            ),
                        }))
                    }
                />
            )}

            <CanvasContainer ref={canvasContainerRef} style={scrollMinHeight ? { minHeight: scrollMinHeight } : undefined}>
                <ViewerWorkspace
                    onLoadViewerData={canSaveLayout && !twinHasModels ? openViewerDataPicker : undefined}
                    layout={currentSlide}
                    origin={layoutOrigin}
                    editing={editingLayout}
                    canSave={canSaveLayout}
                    saving={layoutSaving}
                    // a 3D Model panel per slide: each slide has its own model (loaded in its panel)
                    hasModel={!!workspaceContext.modelPanels}
                    controlRoom={dtScope === "group"}
                    organization={dtScope === "organization"}
                    imageSources={imageSources}
                    chartOptions={chartOptions}
                    maximizedId={maximizedPanel}
                    hidden={!inViewer}
                    style={{ left: VIEWER_GAP, top: panelsTop, right: viewerRightInset, bottom: VIEWER_GAP }}
                    onLayoutChange={(slide) => setDraftLayout(replaceSlide(draftLayout ?? shownLayout, slide))}
                    slideBar={
                        // always: with one slide too, it is where the layout is edited
                        (
                            <SlideBar
                                slides={visibleSlides(workspaceLayout, hiddenSlides)}
                                allSlides={workspaceLayout.slides}
                                current={currentSlide}
                                tags={slideTags(workspaceLayout)}
                                editing={editingLayout}
                                phone={workspacePhone}
                                onGo={goToSlide}
                                onStep={(delta) => goToSlide(stepSlide(workspaceLayout, currentSlide.id, delta, hiddenSlides))}
                                // out of the editing they take effect at once (changeSlides); while editing, in the draft
                                onAdd={() => {
                                    const added = addSlide(draftLayout ?? shownLayout, currentSlide.id);
                                    if (draftLayout) {
                                        setDraftLayout(added.layout);
                                        goToSlide(added.id);
                                    } else void changeSlides(added.layout, added.id);
                                }}
                                onDuplicate={() => void duplicateCurrentSlide()}
                                onRemove={() => {
                                    const rest = removeSlide(draftLayout ?? shownLayout, currentSlide.id);
                                    if (draftLayout) {
                                        setDraftLayout(rest.layout);
                                        goToSlide(rest.id);
                                    } else void changeSlides(rest.layout, rest.id);
                                }}
                                onMove={(delta) => setDraftLayout(moveSlide(draftLayout ?? shownLayout, currentSlide.id, delta))}
                                onUpdate={(patch) => setDraftLayout(updateSlide(draftLayout ?? shownLayout, currentSlide.id, patch))}
                                onOverview={() => setSlidesOverview(true)}
                                canEdit={inViewer && !workspacePhone}
                                canSave={canSaveLayout}
                                saving={layoutSaving}
                                restoreLabel={
                                    canSaveLayout
                                        ? editingLayout && layoutOrigin !== "automatic"
                                            ? "Automatic layout"
                                            : null
                                        : layoutOrigin === "local"
                                        ? "Group layout"
                                        : null
                                }
                                onEdit={startLayoutEdit}
                                onAddPanel={() => setAddingPanel(true)}
                                onCancel={cancelLayoutEdit}
                                onSave={() => void saveLayoutForGroup()}
                                onDone={finishLayoutEdit}
                                onRestore={() => void restoreLayout()}
                            />
                        )
                    }
                    overlay={
                        slidesOverview && (
                            <AllSlides
                                slides={workspaceLayout.slides}
                                currentId={currentSlide.id}
                                hiddenIds={hiddenSlides}
                                onOpen={(id) => {
                                    // a hidden slide opened is shown again in the slide bar
                                    setHiddenSlides((ids) => ids.filter((i) => i !== id));
                                    goToSlide(id);
                                    setSlidesOverview(false);
                                }}
                                // changing the order starts editing the layout, as adding a panel does
                                onReorder={(id, to) => setDraftLayout(reorderSlide(draftLayout ?? shownLayout, id, to))}
                                onSetHidden={(ids, hide) => setHiddenSlides((hidden) => setSlidesHidden(workspaceLayout, hidden, ids, hide))}
                                onClose={() => setSlidesOverview(false)}
                            />
                        )
                    }
                    onMaximize={setMaximizedPanel}
                    onStartEdit={startLayoutEdit}
                    onCancelEdit={cancelLayoutEdit}
                    onSave={saveLayoutForGroup}
                    onDone={finishLayoutEdit}
                    onRestore={restoreLayout}
                    onPhoneChange={setWorkspacePhone}
                    onEditPanel={editPanel}
                    panelActions={panelActions}
                    addingPanel={addingPanel}
                    onAddingPanelChange={setAddingPanel}
                    renderPanel={(panel: WorkspacePanel) =>
                        panel.type === "simulator" ? (
                            simulatorEditing && canSaveLayout ? (
                                <SimulatorFormatEditor
                                    format={digitalTwinGltfData.digitalTwinSimulationFormat ?? {}}
                                    onSave={saveEditedSimulatorFormat}
                                    onCancel={() => setSimulatorEditing(false)}
                                />
                            ) : (
                            <SimulatorPanel
                                format={digitalTwinGltfData.digitalTwinSimulationFormat ?? {}}
                                values={opts.digitalTwinSimulatorState}
                                simulating={state.lockReadingButtomLabel === BUTTON_LABELS.UNLOCK_READ_MEASUREMENTS}
                                onChange={handlers.updateDigitalTwinSimulatorState}
                                onToggleSimulation={handlers.handleLockReadMeasurementsButtonClick}
                                onGetLastMeasurements={handlers.handleGetLastMeasurementsButton}
                                canEdit={canSaveLayout}
                            />
                            )
                        ) : panel.type === "orgOverview" ? (
                            dtScope === "organization" && digitalTwinSelected ? (
                                <OrgOverviewPanel
                                    panel={panel}
                                    groupId={digitalTwinSelected.groupId}
                                    digitalTwinId={digitalTwinSelected.id}
                                    load={loadOrgOverview}
                                    paused={!inViewer || editingPanelId !== null}
                                    live={controlRoomLive}
                                />
                            ) : (
                                <OrganizationScopeNotice organizationPanel />
                            )
                        ) : dtScope === "organization" &&
                        (panel.type === "alarms" || panel.type === "approvals" || panel.type === "assetState" || panel.type === "health" || panel.type === "pipelineLogs") ? (
                            <OrganizationScopeNotice />
                        ) : panel.type === "alarms" || panel.type === "approvals" ? (
                            digitalTwinSelected ? (
                                <HistoryPanel
                                    kind={panel.type}
                                    groupId={digitalTwinSelected.groupId}
                                    // a control room: those of the whole group (shown only: acting on them goes through the
                                    // Alarms and Approvals pages, which know each digital twin)
                                    digitalTwinId={dtScope === "group" ? 0 : digitalTwinSelected.id}
                                    api={historyApi}
                                    paused={!inViewer}
                                    actions={dtScope === "group" ? undefined : historyActions}
                                />
                            ) : null
                        ) : (panel.type === "health" || panel.type === "pipelineLogs") && digitalTwinSelected ? (
                            dtScope !== "group" ? (
                                <OrganizationScopeNotice />
                            ) : panel.type === "health" ? (
                                <HealthPanel
                                    groupId={digitalTwinSelected.groupId}
                                    digitalTwinId={digitalTwinSelected.id}
                                    load={loadControlRoom}
                                    paused={!inViewer}
                                    live={controlRoomLive}
                                />
                            ) : (
                                <PipelineLogsPanel
                                    groupId={digitalTwinSelected.groupId}
                                    digitalTwinId={digitalTwinSelected.id}
                                    load={loadControlRoom}
                                    loadLogs={loadControlRoomLogs}
                                    paused={!inViewer}
                                    live={controlRoomLive}
                                />
                            )
                        ) : panel.type === "assetState" && dtScope === "group" && digitalTwinSelected ? (
                            <GroupAssetStatePanel
                                groupId={digitalTwinSelected.groupId}
                                digitalTwinId={digitalTwinSelected.id}
                                load={loadControlRoom}
                                paused={!inViewer || editingPanelId !== null}
                                live={controlRoomLive}
                                settings={settingsOfPanel(panel)}
                            />
                        ) : panel.type === "assetState" ? (
                            digitalTwinSelected ? (
                                <AssetStatePanel
                                    panel={panel}
                                    groupId={digitalTwinSelected.groupId}
                                    digitalTwinId={digitalTwinSelected.id}
                                    load={loadAssetState}
                                    paused={!inViewer || editingPanelId !== null}
                                    live={assetStateLive}
                                />
                            ) : null
                        ) : panel.type === "chart" ? (
                            digitalTwinSelected ? (
                                <PageClock clock={refreshClock} time={pageTime}>
                                    {(pageRange, refreshTick) => (
                                        <ChartPanel
                                            panel={panel}
                                            groupId={digitalTwinSelected.groupId}
                                            options={chartOptions}
                                            fetchSeries={fetchChartSeries}
                                            pageRange={pageRange}
                                            refreshTick={refreshTick}
                                            paused={!inViewer || editingPanelId !== null}
                                        />
                                    )}
                                </PageClock>
                            ) : null
                        ) : panel.type === "picture" ? (
                            <PictureView file={panel.file} fit={panel.fit} bindings={panel.bindings} store={slideLiveStore} load={pictureFiles?.load} subscribe={pictureFiles?.subscribe} />
                        ) : panel.type === "markdown" ? (
                            <MarkdownView text={panel.text ?? ""} store={slideLiveStore} />
                        ) : panel.type === "surface" ? (
                            <SurfaceView surface={panel.surface} store={slideLiveStore} label={panel.title ?? "3D Surface"} />
                        ) : panel.type === "image" ? (
                            <ImageFrame frameStore={frameStore} source={panel.source ?? ANY_IMAGE_SOURCE} mode={panel.display === "photo" ? "photo" : "video"} />
                        ) : viewerHasModel && digitalTwinGltfData.slideId === currentSlide.id ? (
                            <>
                                <ModelSlot host={modelHost} right={modelSettingsView && !workspacePhone ? MODEL_SETTINGS_INSET : undefined} />
                                {modelSettingsView}
                            </>
                        ) : (
                            <EmptyModelPanel
                                loading={slideModelLoading}
                                error={slideModelError}
                                busy={viewerDataBusy}
                                onLoad={canSaveLayout && !editingLayout ? () => slideModelInput.current?.click() : undefined}
                                editing={editingLayout}
                            />
                        )
                    }
                />
                {state.activeViewer === "pipeline" && (
                    <PipelineErrorBoundary resetKey={dtUid}>
                    <ReactFlowProvider>
                        <Flow
                            natsClient={natsClient}
                            natsConnectionStatus={connectionStatus}
                            natsSubjectsData={digitalTwinGltfData.natsSubjectsData}
                            assetS3Folders={assetS3Folders}
                            digitalTwinSelected={digitalTwinSelected}
                            orgSelected={dtOrg}
                            groupSelected={dtGroup}
                            nodes={pipelineNodes}
                            edges={pipelineEdges}
                            setNodes={setPipelineNodes}
                            setEdges={setPipelineEdges}
                            handlePipelineUiChanged={handlers.handlePipelineUiChanged}
                            importPipelineRef={pipelineImportRef}
                            focusNodeRef={flowFocusRef}
                        />
                    </ReactFlowProvider>
                    </PipelineErrorBoundary>
                )}


                {/* the subjects of the twin the NATS server refuses to the user */}
                <NatsPermissionNotice top={panelsTop} />
                {/* Header */}
                <Header
                    isAssistantPanelOpen={state.isAssistantPanelOpen}
                    isNatsConnected={connectionStatus === "Connected"}
                    digitalTwinState={state.digitalTwinState}
                    activeViewer={state.activeViewer}
                    showOnlyPipelineViewer={showOnlyPipelineViewer}
                    handleAssistantPanelOpenAndClose={handlers.handleAssistantPanelOpenAndClose}
                    handleToggleActiveViewer={handlers.handleToggleActiveViewer}
                    handleSetActiveViewer={handlers.handleSetActiveViewer}
                    handlePipelineLogsOpen={handlers.handlePipelineLogsOpen}
                    handleOpenGrafanaDashboard={handlers.handleOpenGrafanaDashboard}
                    handleDigitalTwinStateShield={handlers.handleDigitalTwinStateShield}
                    handleDeployPipeline={handleDeployPipeline}
                    handleStopPipeline={handleStopPipeline}
                    handleFileUpload={handleFileUpload}
                    handleDownloadYamlFile={handleDownloadYamlFile}
                    selectedNodesCount={selectedNodesCount}
                    handleReinitiatePipeline={handleReinitiatePipeline}
                    isPipelineUiChanged={state.isPipelineUiChanged}
                    close3DViewer={handleClose3DViewer}
                    assetWithCameraSelected={assetWithCameraSelected}
                    pipelineStatus={pipelineStatus}
                    pipelineLeaderReplicaIndex={pipelineLeaderReplicaIndex}
                    digitalTwinName={digitalTwinSelected?.description || digitalTwinSelected?.digitalTwinUid}
                    digitalTwinType={digitalTwinSelected?.type}
                    assetName={assetName}
                    onOpenAssetSwitcher={onOpenAssetSwitcher}
                    workspaceControls={
                        <>
                        {state.activeViewer === "3D" && hasCharts && (
                            <TimePicker time={pageTime} onChange={changePageTime} onRefresh={refreshNow} compact={workspacePhone} />
                        )}
                        <SoundToggle visible={state.activeViewer === "3D" && twinLiveTopics.includes(SOUND_TOPIC)} enabled={viewerSound.enabled} onToggle={viewerSound.toggle} />
                        <WorkspaceControls
                            visible={state.activeViewer === "3D" && !editingLayout && !workspacePhone}
                            canSave={canSaveLayout}
                            origin={layoutOrigin}
                            onEdit={startLayoutEdit}
                            onRestore={restoreLayout}
                            onDownloadConfig={() => void downloadConfig()}
                            downloadImages={configImageNames.length}
                            onLoadConfig={(file) => void openConfigFile(file)}
                            dataMenu={
                                <ViewerDataMenu
                                    canEdit={canSaveLayout}
                                    busy={viewerDataBusy}
                                    status={{ configImages: configImageNames.length }}
                                    onLoadFiles={openViewerDataPicker}
                                    onDownloadAll={() => void downloadAllViewerData()}
                                    onDownloadPart={(part) => void downloadViewerDataPart(part)}
                                    onOpenConfigFile={(file) => void openConfigFile(file)}
                                />
                            }
                        />
                        </>
                    }
                    chatEnabled={chatEnabled}
                    chatUnread={chatUnread}
                    assistantPanelWidth={assistantPanelShown ? assistantPanelWidth : 0}
                    logsWidth={logsShown ? pipelineLogsWidth : 0}
                    pipelineErrors={unseenPipelineErrors}
                    isPipelineLogsOpen={logsShown}
                    canSeePipelineLogs={canSeePipelineLogs}
                    viewerAvailable={viewerAvailable}
                    viewerHasModel={viewerHasModel}
                    onHeightChange={setTopBarHeight}
                    canEditPipeline={canSaveLayout || !viewerAvailable}
                />

                {modelRemoval && (
                    <ModelRemovalDialog
                        lost={modelRemoval.lost}
                        onCancel={() => setModelRemoval(null)}
                        onConfirm={() => {
                            const { proceed } = modelRemoval;
                            setModelRemoval(null);
                            proceed();
                        }}
                    />
                )}
                {configLoad && (
                    <ViewerConfigDialog
                        fileName={configLoad.fileName}
                        result={configLoad.result}
                        refWarnings={
                            "error" in configLoad.result || !configLoad.result.layout
                                ? []
                                : [
                                      ...checkViewerConfigRefs(configLoad.result.layout, {
                                          series: chartOptions,
                                          imageSources: (digitalTwinGltfData?.natsSubjectsData ?? [])
                                              .map((data) => data.topicRef)
                                              .filter((ref) => DEVICE_IMAGE_SOURCE.test(ref)),
                                      }),
                                      ...(configLoad.images
                                          ? packageImageWarnings(configLoad.result.layout, configLoad.images, configLoad.twinImages ?? null).missing.map(
                                                (name) => `A Picture panel shows ${name}, which is neither in the zip nor in the twin.`,
                                            )
                                          : []),
                                  ]
                        }
                        images={
                            configLoad.images && !("error" in configLoad.result)
                                ? {
                                      summary: describePackageImages(configLoad.images),
                                      count: configLoad.images.length,
                                      replaces: packageImageWarnings(configLoad.result.layout, configLoad.images, configLoad.twinImages ?? null).replaces,
                                      ignored: configLoad.ignored ?? [],
                                  }
                                : undefined
                        }
                        onLoad={loadConfig}
                        onClose={() => setConfigLoad(null)}
                    />
                )}

                {/* The chat with the assistant, docked on the right of the Viewer */}
                {assistantPanelShown && digitalTwinSelected && (
                    <AssistantPanel
                        placement="side"
                        opts={opts}
                        setOpts={setOpts}
                        sensorObjects={state.sensorObjects}
                        sensorCollectionNames={state.sensorCollectionNames}
                        assetObjects={state.assetObjects}
                        assetCollectionNames={state.assetCollectionNames}
                        genericObjects={state.genericObjects}
                        genericObjectCollectionNames={state.genericObjectCollectionNames}
                        femSimulationObjects={state.femSimulationObjects}
                        femSimObjectCollectionNames={state.femSimObjectCollectionNames}
                        femResultDates={state.femResultDates}
                        femResultNames={state.femResultNames}
                        digitalTwinSimulationFormat={digitalTwinGltfData.digitalTwinSimulationFormat}
                        getLastMeasurementsButtomLabel={state.getLastMeasurementsButtomLabel}
                        lockReadingButtomLabel={state.lockReadingButtomLabel}
                        handleGetLastMeasurementsButton={handlers.handleGetLastMeasurementsButton}
                        handleLockReadMeasurementsButtonClick={handlers.handleLockReadMeasurementsButtonClick}
                        chatContent={
                            <ChatAssistant
                                embedded
                                visible={chatVisible}
                                chatMessages={chatMessages}
                                setChatMessages={setChatMessages}
                                chatAssistantLanguage={digitalTwinSelected.chatAssistantLanguage}
                                chatAssistantSecondLanguage={digitalTwinSelected.chatAssistantSecondLanguage}
                                chatAssistantVoiceLanguage={digitalTwinSelected.chatAssistantVoiceLanguage}
                                handleRemoveChatAssistantHistory={handleRemoveChatAssistantHistory}
                                voiceService={chatVoiceService}
                                attachmentService={chatAttachmentService}
                            />
                        }
                        chatActive
                        chatOnly
                        width={assistantPanelWidth}
                        onResizeWidth={setChatWidth}
                        onClose={narrowScreen ? undefined : () => setState((prev) => ({ ...prev, isAssistantPanelOpen: false }))}
                        onBackToViewer={
                            narrowScreen
                                ? () => setState((prev) => ({ ...prev, isAssistantPanelOpen: false }))
                                : undefined
                        }
                    />
                )}

                {/* Pipeline logs (pipeline view only) */}
                {logsShown && (
                    <PipelineLogs
                        logMessages={logMessages}
                        setLogMessages={setLogMessages}
                        width={pipelineLogsWidth}
                        onResizeWidth={setLogsWidth}
                        onClose={() => setState((prev) => ({ ...prev, isPipelineLogsOpen: false }))}
                        canShowInFlow={canShowInFlow}
                        onShowInFlow={handleShowInFlow}
                    />
                )}

                {editingPanel?.type === "picture" && pictureFiles && (
                    <PictureEditor
                        panel={editingPanel}
                        store={slideLiveStore}
                        topics={liveTopics}
                        files={pictureFiles}
                        onApply={applyPanel}
                        onDiscard={() => setEditingPanelId(null)}
                    />
                )}
                {editingPanel?.type === "surface" && (
                    <SurfaceEditor
                        panel={editingPanel}
                        store={slideLiveStore}
                        topics={liveTopics}
                        onApply={applyPanel}
                        onDiscard={() => setEditingPanelId(null)}
                    />
                )}
                <input
                    ref={viewerDataInputRef}
                    type="file"
                    multiple
                    hidden
                    accept=".zip,.glb,.gltf,.json"
                    data-testid="viewer-data-files"
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void onViewerDataFiles(files);
                    }}
                />
                <input
                    ref={slideModelInput}
                    type="file"
                    hidden
                    accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                    data-testid="slide-model-file"
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (files.length > 0) void onViewerDataFiles(files, "model");
                    }}
                />
                <input
                    ref={simulatorFormatInput}
                    type="file"
                    hidden
                    accept=".json,.yml,.yaml,application/json"
                    data-testid="simulator-format-file"
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (files.length > 0) void uploadSlideSimulatorFormat(files[0]);
                    }}
                />
                {viewerDataLoad && (
                    <ViewerDataLoadDialog
                        set={viewerDataLoad.set}
                        source={viewerDataLoad.source}
                        states={viewerDataStates}
                        onLoad={(items) => void loadViewerData(items)}
                        onClose={() => {
                            setViewerDataLoad(null);
                            setViewerDataStates(null);
                        }}
                    />
                )}
                {editingPanel?.type === "orgOverview" && (
                    <OrgOverviewEditor panel={editingPanel} onApply={applyPanel} onDiscard={() => setEditingPanelId(null)} />
                )}
                {editingPanel?.type === "assetState" && digitalTwinSelected && dtScope === "group" && (
                    // a control room: the paths and the preview of the group's assets (its own asset is virtual)
                    <GroupAssetStateEditor
                        panel={editingPanel}
                        groupId={digitalTwinSelected.groupId}
                        digitalTwinId={digitalTwinSelected.id}
                        load={loadControlRoom}
                        live={controlRoomLive}
                        onApply={applyPanel}
                        onDiscard={() => setEditingPanelId(null)}
                    />
                )}
                {editingPanel?.type === "assetState" && digitalTwinSelected && dtScope !== "group" && (
                    <AssetStateEditor
                        panel={editingPanel}
                        groupId={digitalTwinSelected.groupId}
                        digitalTwinId={digitalTwinSelected.id}
                        load={loadAssetState}
                        onApply={applyPanel}
                        onDiscard={() => setEditingPanelId(null)}
                    />
                )}
                {editingPanel?.type === "markdown" && (
                    <MarkdownEditor
                        panel={editingPanel}
                        store={slideLiveStore}
                        topics={liveTopics}
                        onApply={applyPanel}
                        onDiscard={() => setEditingPanelId(null)}
                    />
                )}
                {editingPanel && editingPanel.type === "chart" && digitalTwinSelected && (
                    <PageClock clock={refreshClock} time={pageTime}>
                        {(pageRange, refreshTick) => (
                            <PanelEditor
                                panel={editingPanel}
                                groupId={digitalTwinSelected.groupId}
                                chartOptions={chartOptions}
                                fetchSeries={fetchChartSeries}
                                pageRange={pageRange}
                                refreshTick={refreshTick}
                                timeControls={<TimePicker time={pageTime} onChange={changePageTime} onRefresh={refreshNow} compact />}
                                onApply={applyPanel}
                                onDiscard={() => setEditingPanelId(null)}
                            />
                        )}
                    </PageClock>
                )}
            </CanvasContainer>
        </>
    );
};

// The Viewer with the 3D model of the slide it shows: each slide of the twin has its own (slideModel.ts). The scene
// says which slide it shows; the model is read (browser storage, else admin_api) and given to it with the twin's data.
const DigitalTwin3DViewer: FC<Viewer3DProps> = (props) => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const twin = props.digitalTwinSelected;
    // the slide remembered for this twin: its model starts loading at once
    const [slide, setSlide] = useState<string | null>(() => getViewerMemory(twin?.digitalTwinUid ?? "").workspaceSlide ?? null);
    const source = useMemo(
        () =>
            twin
                ? {
                      digitalTwinUid: twin.digitalTwinUid,
                      groupId: twin.groupId,
                      digitalTwinId: twin.id,
                      auth: { accessToken, refreshToken, authDispatch },
                  }
                : null,
        [twin, accessToken, refreshToken, authDispatch],
    );
    const { data: withModel, loading, error } = useSlideModel(props.digitalTwinGltfData, slide, source);
    // the simulator of the slide shown: its own format, or the twin's
    const [slideFormat, setSlideFormat] = useState<Record<string, SimulatorParameter> | null>(null);
    const data = useMemo(
        () =>
            slideFormat
                ? { ...withModel, digitalTwinSimulationFormat: slideFormat as any, twinSimulationFormat: withModel.digitalTwinSimulationFormat }
                : withModel,
        [withModel, slideFormat],
    );
    return (
        <DigitalTwin3DViewerScene
            {...props}
            digitalTwinGltfData={data}
            onShownSlide={setSlide}
            onSlideSimulatorFormat={setSlideFormat}
            slideModelLoading={loading}
            slideModelError={error}
        />
    );
};

export default DigitalTwin3DViewer;