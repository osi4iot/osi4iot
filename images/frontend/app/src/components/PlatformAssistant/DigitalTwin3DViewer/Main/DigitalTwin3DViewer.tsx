// DigitalTwin3DViewer.tsx
import { FC, SetStateAction, useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
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
import Model from "./Model";
import SetGltfObjects from "../Objects/SetGlftOjbects";
import SimulationLegend from "../Utils/SimulationLegend";
import ChatAssistant, { LlmMessage } from "../ChatAssitant/ChatAssistant";
import { createPipelineVoiceService } from "../ChatAssitant/voiceService";
import PipelineLogs, { PIPELINE_LOGS_WIDTH, PipelineLog, clampLogsWidth } from "../Pipeline/PipelineLogs";
import { levelOf } from "../Pipeline/pipelineLogsModel";
import DigitalTwinSimulatorModal from "../ViewerTools/DigitalTwinSimulatorModal";
import { Header } from "../Utils/Headers";
import AssistantPanel, { ASSISTANT_PANEL_CHAT_WIDTH, VIEWER_GAP, ASSISTANT_PANEL_WIDTH, clampChatWidth } from "../AssistantPanel/AssistantPanel";
import { usePersistentState } from "../../../../state/uiStore";

// Styled components
import {
    CanvasContainer,
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
import { ImageFrame } from "../PhotoFrame/PhotoFrame";
import useNatsSubscription from "../NatsHook/useNatsSubcription";
import { filterNatsSubject } from "../NatsHook/tools";
import * as THREE from "three";
import { browserTimeZone } from "../../../../tools/timeZones";

const sc = StringCodec();

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
const CameraMemory: FC<{ dtUid: string; controlsRef: { current: any } }> = ({ dtUid, controlsRef }) => {
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
            rememberViewer(dtUid, {
                camera: {
                    position: camera.position.toArray() as [number, number, number],
                    target: ctrl.target.toArray() as [number, number, number],
                    zoom: camera.zoom,
                    viewSize,
                },
            });
        };
        ctrl.addEventListener("end", save);
        return () => ctrl.removeEventListener("end", save);
    }, [camera, controlsRef, dtUid]);
    return null;
};

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
    digitalTwinSelected,
    digitalTwinGltfData,
    assetS3Folders,
    orgSelected,
    groupSelected,
    close3DViewer,
    fetchFemResFileWorker,
    refreshDigitalTwins,
    assetWithCameraSelected,
    sensorWithCameraSelected,
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
    const showOnlyPipelineViewer = digitalTwinGltfData.gltfFile == null;
    const chatTabSelected = chatEnabled && state.isChatAssistantOpen;
    const assistantPanelShown =
        state.isAssistantPanelOpen &&
        (state.activeViewer === "3D" ||
            (chatTabSelected && (state.activeViewer === "image_frame" || showOnlyPipelineViewer)));
    const chatVisible = assistantPanelShown && chatTabSelected;
    const chatVisibleRef = useRef(chatVisible);
    chatVisibleRef.current = chatVisible;
    // con chat el panel lateral es más ancho y tiene el mismo ancho en todas las pestañas (el usuario lo
    // puede cambiar arrastrando su borde izquierdo y se conserva)
    const [chatWidth, setChatWidth] = usePersistentState<number>("assistantPanel.width", ASSISTANT_PANEL_CHAT_WIDTH);
    const assistantPanelWidth = chatEnabled ? clampChatWidth(chatWidth) : ASSISTANT_PANEL_WIDTH;
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
    const orgsOfGroupsManagedTable = useTable("orgsOfGroupsManaged");
    const dtGroup = useMemo(() => {
        const groupId = digitalTwinSelected?.groupId;
        if (groupSelected && (groupId === undefined || groupSelected.id === groupId)) return groupSelected;
        return groupsManagedTable.find((group) => group.id === groupId) ?? groupSelected ?? null;
    }, [groupSelected, groupsManagedTable, digitalTwinSelected?.groupId]);
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

    const [opts, setOpts] = useViewerOptions([], memory.opts as ViewerOptions | undefined);
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
    const femResults = useFemResults(digitalTwinSelected, legendRenderer, opts, fetchFemResFileWorker);

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
    const handlers = createHandlers(
        {
            digitalTwinSelected,
            digitalTwinGltfData,
            activeViewer: state.activeViewer,
            assetWithCameraSelected,
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
    const chatVoiceService = useMemo(
        () => (natsClient && voiceTopicSubject ? createPipelineVoiceService(natsClient, voiceTopicSubject) : null),
        [natsClient, voiceTopicSubject],
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

    // 1. Send digital twin simulator state via NATS
    useLayoutEffect(() => {
        if (natsClient && opts.digitalTwinSimulatorState !== undefined) {
            if (digitalTwinModelNatsTopic && Object.keys(opts.digitalTwinSimulatorState).length !== 0) {
                if (state.digitalTwinSimulatorSendData) {
                    const natsSubject = digitalTwinModelNatsTopic.natsSubject;
                    const messageToSend = JSON.stringify(opts.digitalTwinSimulatorState);
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
                        !(chatVisible || state.showDtSimulatorModal || state.activeViewer === "pipeline")
                    ) {
                        toast.warning(
                            "Warning: To use the digital twin simulator, reading the measurements from the sensors must be locked.",
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
                    const messageToSend = JSON.stringify({
                        userName: chatMessages[chatMessages.length - 1].userName,
                        message: chatMessages[chatMessages.length - 1].message,
                        timeZone: userTimeZone,
                        viewer: viewerContentsRef.current,
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
            if (text === "") return;
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
                },
            ]);
            if (author === loggedUserNameRef.current) openChatTabRef.current();
        },
        [handleUpdateChatAssistantMessages, setChatMessages, setState],
    );

    useNatsSubscription(
        natsClient,
        digitalTwinGltfData?.natsSubjectsData?.map((subject) => subject.natsSubject).filter(filterNatsSubject) || [],
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
                handlers.handleSetActiveViewer("image_frame");
            } else {
                if (!digitalTwinGltfData.digitalTwinGltfUrl) {
                    handlers.handleSetActiveViewer("pipeline");
                }
            }
        }
    }, [digitalTwinSelected, sensorWithCameraSelected]);

    // El editor de pipelines (Flow) registra aquí la función que coloca con el ratón los nodos importados
    const pipelineImportRef = useRef<((nodes: any[], edges: any[]) => void) | null>(null);

    // Pipeline logs: only in the pipeline view, docked on the right (width kept while the app is open)
    const logsShown = !!digitalTwinSelected && state.isPipelineLogsOpen && state.activeViewer === "pipeline";
    const [logsWidth, setLogsWidth] = usePersistentState<number>("pipelineLogs.width", PIPELINE_LOGS_WIDTH);
    const pipelineLogsWidth = clampLogsWidth(logsWidth);
    // "Show in flow": Flow registers here the function that centres the canvas on a node
    const flowFocusRef = useRef<((uid: string, tone?: string) => boolean) | null>(null);
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

    return (
        <>
            {digitalTwinSelected && digitalTwinGltfData && digitalTwinGltfData.digitalTwinGltfUrl && (
                <SetGltfObjects
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

            <CanvasContainer ref={canvasContainerRef}>
                <div
                    style={{
                        display:
                            state.activeViewer === "3D" && digitalTwinGltfData?.digitalTwinGltfUrl ? "block" : "none",
                        width: "100%",
                        height: "100%",
                    }}
                >
                    <Canvas
                        ref={canvasRef}
                        dpr={window.devicePixelRatio}
                        orthographic
                        shadows="percentage"
                        legacy={LEGACY_COLOR_MANAGEMENT}
                        gl={{
                            toneMapping: THREE.ACESFilmicToneMapping,
                            toneMappingExposure: 1.5,
                            outputColorSpace: THREE.SRGBColorSpace,
                        }}
                        camera={{ position: [4, 4, 0], zoom: 300 }}
                    >
                        <ShaderPrewarm gltfData={digitalTwinGltfData} />
                        <Stage
                            controls={controlsRef}
                            environment={opts.environment}
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
                            initialView={memory.camera}
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
                        <OrbitControls ref={controlsRef} mouseButtons={MOUSE_BUTTONS} />
                        <CameraMemory dtUid={dtUid} controlsRef={controlsRef} />
                    </Canvas>
                </div>
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

                {assetWithCameraSelected && state.activeViewer === "image_frame" && <ImageFrame frameStore={frameStore} />}

                {/* FEM Simulation Legend */}
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
                    handleReinitiatePipeline={handleReinitiatePipeline}
                    isPipelineUiChanged={state.isPipelineUiChanged}
                    close3DViewer={handleClose3DViewer}
                    assetWithCameraSelected={assetWithCameraSelected}
                    pipelineStatus={pipelineStatus}
                    pipelineLeaderReplicaIndex={pipelineLeaderReplicaIndex}
                    digitalTwinName={digitalTwinSelected?.description || digitalTwinSelected?.digitalTwinUid}
                    digitalTwinType={digitalTwinSelected?.type}
                    chatEnabled={chatEnabled}
                    chatUnread={chatUnread}
                    assistantPanelWidth={assistantPanelShown ? assistantPanelWidth : 0}
                    logsWidth={logsShown ? pipelineLogsWidth : 0}
                    pipelineErrors={unseenPipelineErrors}
                    isPipelineLogsOpen={logsShown}
                />

                {/* Panel del asistente (chat y ajustes del visor) */}
                {assistantPanelShown && (
                    <AssistantPanel
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
                            digitalTwinSelected && chatEnabled ? (
                                <ChatAssistant
                                    embedded
                                    visible={chatVisible}
                                    chatMessages={chatMessages}
                                    setChatMessages={setChatMessages}
                                    chatAssistantLanguage={digitalTwinSelected.chatAssistantLanguage}
                                    handleRemoveChatAssistantHistory={handleRemoveChatAssistantHistory}
                                    voiceService={chatVoiceService}
                                />
                            ) : undefined
                        }
                        chatActive={chatTabSelected}
                        onChatActiveChange={(active) => setState((prev) => ({ ...prev, isChatAssistantOpen: active }))}
                        chatUnread={chatUnread}
                        chatOnly={state.activeViewer !== "3D"}
                        width={assistantPanelWidth}
                        onResizeWidth={chatEnabled ? setChatWidth : undefined}
                        simulatorFloating={state.showDtSimulatorModal}
                        onFloatSimulator={handlers.handleOpenSimulator}
                        onDockSimulator={handlers.handleDockSimulator}
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

                {/* Digital Twin Simulator Modal */}
                {state.showDtSimulatorModal && (
                    <DigitalTwinSimulatorModal
                        digitalTwinSimulatorFormat={digitalTwinGltfData.digitalTwinSimulationFormat}
                        values={opts.digitalTwinSimulatorState}
                        updateDigitalTwinSimulatorState={handlers.updateDigitalTwinSimulatorState}
                        onDock={handlers.handleDockSimulator}
                        onStop={handlers.handleStopSimulator}
                    />
                )}

                {/* Selected Object Info */}
                {state.activeViewer === "3D" && (
                    <SelectedObjectInfoContainer
                        $right={assistantPanelShown ? assistantPanelWidth + 2 * VIEWER_GAP : VIEWER_GAP}
                    >
                        <ObjectInfoContainer>
                            <ObjectInfo ref={selectedObjNameRef}>Name: -</ObjectInfo>
                            <ObjectInfo ref={selectedObjTypeRef}>Type: -</ObjectInfo>
                            <ObjectInfo ref={selectedObjCollectionNameRef}>Collection: -</ObjectInfo>
                        </ObjectInfoContainer>
                    </SelectedObjectInfoContainer>
                )}
            </CanvasContainer>
        </>
    );
};

export default DigitalTwin3DViewer;
