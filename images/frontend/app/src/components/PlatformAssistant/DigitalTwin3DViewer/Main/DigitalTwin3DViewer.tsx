// DigitalTwin3DViewer.tsx
import { FC, SetStateAction, useEffect, useLayoutEffect, useState, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { NatsConnection, StringCodec, headers } from "nats.ws";
import "react-dat-gui/dist/index.css";

// Types and constants
import { IPipelineEdge, IPipelineNode, Viewer3DProps } from "../Types/types";
import { MOUSE_BUTTONS, DAT_GUI_STYLE } from "../Utils/constants";

// Components
import { Stage } from "../Utils/Stage";
import Model from "./Model";
import SetGltfObjects from "../Objects/SetGlftOjbects";
import SimulationLegend from "../Utils/SimulationLegend";
import ChatAssistant from "../ChatAssitant/ChatAssistant";
import PipelineLogs from "../Pipeline/PipelineLogs";
import DigitalTwinSimulatorModal from "../ViewerTools/DigitalTwinSimulatorModal";
import { Header } from "../Utils/Headers";
import { ControlPanel } from "../Utils/ControlPanels";

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

const DigitalTwin3DViewer: FC<Viewer3DProps> = ({
    digitalTwinSelected,
    digitalTwinGltfData,
    assetS3Folders,
    orgSelected,
    groupSelected,
    close3DViewer,
    fetchFemResFileWorker,
    refreshDigitalTwins,
    assetWithMobilePhotoSelected,
}) => {
    // Hooks
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    const [state, setState] = useViewerState();
    const legendRenderer = useLegendRenderer();
    const { connectionStatus, natsClient } = useNatsConnection();
    const openDashboardTab = useOpenWindowTab();
    const { imageUrl, handleImageUrlChange } = useImageFrame();
    const [isReady, setIsReady] = useState(false);

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

    const [opts, setOpts] = useViewerOptions([]);
    const { chatMessages, setChatMessages, handleUpdateChatAssistantMessages } = useChatMessages(setOpts);
    const { logMessages, setLogMessages, handleUpdateLogMessages } = usePipelineLogs(setChatMessages);
    const sim2stateTopic =
        digitalTwinGltfData?.natsSubjectsData?.filter((subject) => subject.topicRef === "sim2state")[0].natsSubject ||
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
            assetWithMobilePhotoSelected,
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
            isControlPanelOpen: state.isControlPanelOpen,
            isChatAssistantOpen: state.isChatAssistantOpen,
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
            setIsControlPanelOpen: (open) => setState((prev) => ({ ...prev, isControlPanelOpen: open })),
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
                genericObjectsVisibilityState: state.initialGenericObjectsVisibilityState || {},
            }));
        }
    }, [state.initialGenericObjectsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialSensorsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                sensorsVisibilityState: state.initialSensorsVisibilityState || {},
            }));
        }
    }, [state.initialSensorsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialAssetsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                assetsVisibilityState: state.initialAssetsVisibilityState || {},
            }));
        }
    }, [state.initialAssetsVisibilityState, setOpts]);

    useEffect(() => {
        if (state.initialFemSimObjectsVisibilityState) {
            setOpts((prev) => ({
                ...prev,
                femSimulationObjectsVisibilityState: state.initialFemSimObjectsVisibilityState || {},
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
                    const dtSimStateString = JSON.stringify(opts.digitalTwinSimulatorState);
                    const initialDTSimStateString = JSON.stringify(state.initialDigitalTwinSimulatorState);
                    if (
                        dtSimStateString !== lastNatsMessageSent &&
                        dtSimStateString !== initialDTSimStateString &&
                        !(state.isChatAssistantOpen || state.showDtSimulatorModal || state.activeViewer === "pipeline")
                    ) {
                        toast.warning(
                            "Warning: To use the digital twin simulator, reading the measurements from the sensors must be locked.",
                        );
                    }
                }
            }
        }
    }, [
        natsClient,
        opts.digitalTwinSimulatorState,
        state.digitalTwinSimulatorSendData,
        digitalTwinModelNatsTopic,
        lastNatsMessageSent,
        state.initialDigitalTwinSimulatorState,
        state.isChatAssistantOpen,
        state.showDtSimulatorModal,
        state.activeViewer,
    ]);

    // 2. Send chat assistant messages via NATS
    useLayoutEffect(() => {
        if (natsClient && state.isChatAssistantOpen) {
            if (digitalTwinModelChatAssistantTopic) {
                const natsSubject = digitalTwinModelChatAssistantTopic.natsSubject;
                if (chatMessages.length !== 0 && chatMessages[chatMessages.length - 1].sender === "user") {
                    const messageToSend = JSON.stringify({
                        userName: chatMessages[chatMessages.length - 1].userName,
                        message: chatMessages[chatMessages.length - 1].message,
                    });
                    const h = headers();
                    h.set("Content-Type", "application/json");
                    h.set("Json-Structure", "object");
                    natsClient.publish(natsSubject, sc.encode(messageToSend), { headers: h });
                }
            }
        }
    }, [natsClient, state.isChatAssistantOpen, chatMessages, digitalTwinModelChatAssistantTopic]);

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
        handleUpdateChatAssistantMessages,
        handleUpdateLogMessages,
        handlePipelineStatusChange,
        handlePipelineLeaderReplicaIndexChange,
        handleSetChatMessages,
    );

    const [pipelineNodes, setPipelineNodes] = useState([] as IPipelineNode[]);
    const [pipelineEdges, setPipelineEdges] = useState([] as IPipelineEdge[]);

    useEffect(() => {
        if (digitalTwinSelected) {
            const { nodes, edges } = processInitialPipelineData(
                digitalTwinSelected,
                natsClient,
                digitalTwinGltfData.natsSubjectsData,
            );
            setPipelineNodes(nodes);
            setPipelineEdges(edges);
        }
    }, [digitalTwinSelected, natsClient, digitalTwinGltfData.natsSubjectsData]);

    useEffect(() => {
        if (digitalTwinSelected && !digitalTwinGltfData.digitalTwinGltfUrl) {
            handlers.handleSetActiveViewer("pipeline");
        }
    }, [digitalTwinSelected]);

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
                        shadows
                        gl={{
                            toneMapping: THREE.ACESFilmicToneMapping,
                            toneMappingExposure: 1.5,
                            outputEncoding: THREE.sRGBEncoding,
                        }}
                        onCreated={(canvasCtx) => {
                            canvasCtx.gl.physicallyCorrectLights = true;
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
                            femResultLoaded={state.femResultLoaded}
                        >
                            <Model
                                digitalTwinGltfData={digitalTwinGltfData}
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
                    </Canvas>
                </div>
                {state.activeViewer === "pipeline" && (
                    <ReactFlowProvider>
                        <Flow
                            natsClient={natsClient}
                            natsConnectionStatus={connectionStatus}
                            natsSubjectsData={digitalTwinGltfData.natsSubjectsData}
                            assetS3Folders={assetS3Folders}
                            digitalTwinSelected={digitalTwinSelected}
                            orgSelected={orgSelected}
                            groupSelected={groupSelected}
                            nodes={pipelineNodes}
                            edges={pipelineEdges}
                            setNodes={setPipelineNodes}
                            setEdges={setPipelineEdges}
                            handlePipelineUiChanged={handlers.handlePipelineUiChanged}
                        />
                    </ReactFlowProvider>
                )}

                {assetWithMobilePhotoSelected && state.activeViewer === "image_frame" && (
                    <ImageFrame imageUrl={imageUrl} />
                )}

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
                    isControlPanelOpen={state.isControlPanelOpen}
                    isNatsConnected={connectionStatus === "Connected"}
                    digitalTwinState={state.digitalTwinState}
                    activeViewer={state.activeViewer}
                    showOnlyPipelineViewer={digitalTwinGltfData.gltfFile == null}
                    handleControlPanelOpenAndClose={handlers.handleControlPanelOpenAndClose}
                    handleToggleActiveViewer={handlers.handleToggleActiveViewer}
                    handleSetActiveViewer={handlers.handleSetActiveViewer}
                    handleChatAssistantOpen={handlers.handleChatAssistantOpen}
                    handlePipelineLogsOpen={handlers.handlePipelineLogsOpen}
                    handleOpenSimulator={handlers.handleOpenSimulator}
                    handleOpenGrafanaDashboard={handlers.handleOpenGrafanaDashboard}
                    handleDigitalTwinStateShield={handlers.handleDigitalTwinStateShield}
                    handleDeployPipeline={handleDeployPipeline}
                    handleStopPipeline={handleStopPipeline}
                    handleFileUpload={handleFileUpload}
                    handleDownloadYamlFile={handleDownloadYamlFile}
                    handleReinitiatePipeline={handleReinitiatePipeline}
                    isPipelineUiChanged={state.isPipelineUiChanged}
                    close3DViewer={close3DViewer}
                    assetWithMobilePhotoSelected={assetWithMobilePhotoSelected}
                    pipelineStatus={pipelineStatus}
                    pipelineLeaderReplicaIndex={pipelineLeaderReplicaIndex}
                />

                {/* Control Panel */}
                {state.isControlPanelOpen && (
                    <ControlPanel
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
                        datGuiStyle={DAT_GUI_STYLE}
                    />
                )}

                {/* Pipeline Manager */}
                {digitalTwinSelected && state.isPipelineLogsOpen && (
                    <PipelineLogs logMessages={logMessages} setLogMessages={setLogMessages} />
                )}

                {/* Chat Assistant */}
                {digitalTwinSelected && state.isChatAssistantOpen && (
                    <ChatAssistant
                        chatMessages={chatMessages}
                        setChatMessages={setChatMessages}
                        chatAssistantLanguage={digitalTwinSelected.chatAssistantLanguage}
                        handleRemoveChatAssistantHistory={handleRemoveChatAssistantHistory}
                    />
                )}

                {/* Digital Twin Simulator Modal */}
                {state.showDtSimulatorModal && (
                    <DigitalTwinSimulatorModal
                        digitalTwinSimulatorFormat={digitalTwinGltfData.digitalTwinSimulationFormat}
                        setShowDigitalTwinSimulator={(show) =>
                            setState((prev) => ({
                                ...prev,
                                showDtSimulatorModal:
                                    typeof show === "function"
                                        ? (show as (prev: boolean) => boolean)(prev.showDtSimulatorModal)
                                        : show,
                            }))
                        }
                        updateDigitalTwinSimulatorState={handlers.updateDigitalTwinSimulatorState}
                        setDigitalTwinSimulatorSendData={(send) =>
                            setState((prev) => ({
                                ...prev,
                                digitalTwinSimulatorSendData: resolveSetStateAction(
                                    send,
                                    prev.digitalTwinSimulatorSendData,
                                ),
                            }))
                        }
                    />
                )}

                {/* Selected Object Info */}
                {state.activeViewer === "3D" && (
                    <SelectedObjectInfoContainer>
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
