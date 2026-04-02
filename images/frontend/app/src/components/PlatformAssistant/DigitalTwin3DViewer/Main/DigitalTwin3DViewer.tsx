// DigitalTwin3DViewer.tsx
import { FC, SetStateAction, useEffect, useLayoutEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Paho from "paho-mqtt";
import "react-dat-gui/dist/dist/index.css";

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
    useMqttConnection,
    usePipelineActions,
    useImageFrame,
    usePipelineState,
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
import useSubscription from "../MqttHook/useSubscription";
import { toast } from "react-toastify";
import { ImageFrame } from "../PhotoFrame/PhotoFrame";

const resolveSetStateAction = <T extends unknown>(action: SetStateAction<T>, prevValue: T): T => {
    return typeof action === "function" ? (action as (prev: T) => T)(prevValue) : action;
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
    const { connectionStatus, mqttClient } = useMqttConnection();
    const openDashboardTab = useOpenWindowTab();
    const { imageUrl, handleImageUrlChange } = useImageFrame();

    useEffect(() => {
        return () => {
            URL.revokeObjectURL(imageUrl);
        };
    }, [imageUrl]);

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
        digitalTwinGltfData?.mqttTopicsData?.filter((topic) => topic.topicRef === "sim2state")[0].mqttTopic || "";
    const { 
        pipelineStatus, 
        pipelineLeaderReplicaIndex,
        handlePipelineStatusChange,
        handlePipelineLeaderReplicaIndexChange,
        queryPipelineStatus, 
        queryChatMessages,
        handleSetChatMessages,
        handleRemoveChatAssistantHistory,
     } = usePipelineState(
        digitalTwinSelected,
        mqttClient,
        sim2stateTopic,
        setChatMessages
    );

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
        if (digitalTwinSelected) {
            setTimeout(() => {
                queryPipelineStatus();
                queryChatMessages();
            }, 500);
        }
    }, [queryPipelineStatus, digitalTwinSelected, queryChatMessages]);

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
                        prev.initialDigitalTwinSimulatorState
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
        }
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
                (resultField: { resultName: string }) => resultField.resultName
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
                state.femResultData
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
                    (result: { resultName: string }) => result.resultName === opts.femSimulationResult
                )[0];
                let units = "";
                if (resultFieldFiltered !== undefined) {
                    units = resultFieldFiltered.units;
                }
                (femMinValueRef.current as any).innerHTML = `Min value: ${sortedFemMinValues[0].toExponential(
                    4
                )} ${units}`;
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
                    (result: { resultName: string }) => result.resultName === opts.femSimulationResult
                )[0];
                if (resultFieldFiltered) {
                    const units = resultFieldFiltered.units;
                    (femMaxValueRef.current as any).innerHTML = `Max value: ${sortedFemMaxValues[0].toExponential(
                        4
                    )} ${units}`;
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
        {}
    );
    const [currentFemSimulationObjectsState, setCurrentFemSimulationObjectsState] = useState<
        FemSimulationObjectState[]
    >([]);

    // Estado para la lógica MQTT que estaba en Model
    const [lastMqttMessageSended, setLastMqttMessageSended] = useState("");

    // Derivar datos MQTT
    const digitalTwinModelMqttTopic =
        digitalTwinGltfData?.mqttTopicsData?.filter((topic) => topic.topicRef === "sim2dtm")[0] || null;
    const digitalTwinModelChatAssistantTopic =
        digitalTwinGltfData?.mqttTopicsData?.filter((topic) => topic.topicRef === "sim2llm")[0] || null;

    // Sincronizar estados iniciales con estados actuales cuando cambien
    useEffect(() => {
        if (state.initialSensorsState) {
            setCurrentSensorsState(state.initialSensorsState);
        }
    }, [state.initialSensorsState]);

    useEffect(() => {
        if (state.initialAssetsState) {
            setCurrentAssetsState(state.initialAssetsState);
        }
    }, [state.initialAssetsState]);

    useEffect(() => {
        if (state.initialGenericObjectsState) {
            setCurrentGenericObjectsState(state.initialGenericObjectsState);
        }
    }, [state.initialGenericObjectsState]);

    useEffect(() => {
        if (state.initialFemSimObjectsState) {
            setCurrentFemSimulationObjectsState(state.initialFemSimObjectsState);
        }
    }, [state.initialFemSimObjectsState]);

    useLayoutEffect(() => {
        if (mqttClient && mqttClient.isConnected() && opts.digitalTwinSimulatorState !== undefined) {
            if (digitalTwinModelMqttTopic && Object.keys(opts.digitalTwinSimulatorState).length !== 0) {
                if (state.digitalTwinSimulatorSendData) {
                    const mqttTopic = digitalTwinModelMqttTopic.mqttTopic;
                    const messageToSend = JSON.stringify(opts.digitalTwinSimulatorState);
                    if (lastMqttMessageSended !== messageToSend) {
                        const message = new Paho.Message(messageToSend);
                        message.destinationName = mqttTopic;
                        mqttClient.send(message);
                        setLastMqttMessageSended(messageToSend);
                    }
                } else {
                    const dtSimStateString = JSON.stringify(opts.digitalTwinSimulatorState);
                    const initialDTSimStateString = JSON.stringify(state.initialDigitalTwinSimulatorState);
                    if (
                        dtSimStateString !== lastMqttMessageSended &&
                        dtSimStateString !== initialDTSimStateString &&
                        !(state.isChatAssistantOpen || state.showDtSimulatorModal || state.activeViewer === "pipeline")
                    ) {
                        const warningMessage =
                            "Warning: To use the digital twin simulator, reading the measurements from the sensors must be locked.";
                        toast.warning(warningMessage);
                    }
                }
            }
        }
    }, [
        mqttClient,
        opts.digitalTwinSimulatorState,
        state.digitalTwinSimulatorSendData,
        digitalTwinModelMqttTopic,
        lastMqttMessageSended,
        state.initialDigitalTwinSimulatorState,
        state.isChatAssistantOpen,
        state.showDtSimulatorModal,
        state.activeViewer,
    ]);

    // 2. Lógica para enviar mensajes del chat assistant
    useLayoutEffect(() => {
        if (mqttClient && mqttClient.isConnected() && state.isChatAssistantOpen) {
            if (digitalTwinModelChatAssistantTopic) {
                const mqttTopic = digitalTwinModelChatAssistantTopic.mqttTopic;
                if (chatMessages.length !== 0 && chatMessages[chatMessages.length - 1].sender === "user") {
                    const messageToSend = JSON.stringify({
                        userName: chatMessages[chatMessages.length - 1].userName,
                        message: chatMessages[chatMessages.length - 1].message,
                        clientId: mqttClient.clientId,
                    });
                    const message = new Paho.Message(messageToSend);
                    message.destinationName = mqttTopic;
                    mqttClient.send(message);
                }
            }
        }
    }, [mqttClient, state.isChatAssistantOpen, chatMessages, digitalTwinModelChatAssistantTopic]);

    useSubscription(
        mqttClient,
        digitalTwinGltfData?.mqttTopicsData?.map((topic) => topic.mqttTopic).filter((topic) => topic !== "") || [],
        digitalTwinGltfData?.mqttTopicsData || [],
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
        handleSetChatMessages
    );

    const [pipelineNodes, setPipelineNodes] = useState([] as IPipelineNode[]);
    const [pipelineEdges, setPipelineEdges] = useState([] as IPipelineEdge[]);

    useEffect(() => {
        if (digitalTwinSelected) {
            const { nodes, edges } = processInitialPipelineData(
                digitalTwinSelected,
                mqttClient,
                digitalTwinGltfData.mqttTopicsData
            );
            setPipelineNodes(nodes);
            setPipelineEdges(edges);
        }
    }, [digitalTwinSelected, mqttClient, digitalTwinGltfData.mqttTopicsData]);

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
        mqttClient,
        digitalTwinGltfData.mqttTopicsData,
        refreshDigitalTwins,
        {
            digitalTwinSelected,
            accessToken,
            refreshToken,
            authDispatch,
        }
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
                                prev.initialDigitalTwinSimulatorState
                            ),
                        }))
                    }
                />
            )}

            <CanvasContainer ref={canvasContainerRef}>
                {state.activeViewer === "3D" && (
                    <Canvas
                        ref={canvasRef}
                        dpr={window.devicePixelRatio}
                        orthographic
                        shadows
                        onCreated={(canvasCtx) => {
                            canvasCtx.gl.physicallyCorrectLights = true;
                        }}
                        camera={{ position: [4, 4, 0], zoom: 300 }}
                    >
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
                                mqttTopicsData={digitalTwinGltfData.mqttTopicsData}
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
                )}
                {state.activeViewer === "pipeline" && (
                    <ReactFlowProvider>
                        <Flow
                            mqttClient={mqttClient}
                            mqttConnectionStatus={connectionStatus}
                            mqttTopicsData={digitalTwinGltfData.mqttTopicsData}
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
                    isMqttConnected={connectionStatus === "Connected"}
                    digitalTwinState={state.digitalTwinState}
                    activeViewer={state.activeViewer}
                    handleControlPanelOpenAndClose={handlers.handleControlPanelOpenAndClose}
                    handleToggleActiveViewer={handlers.handleToggleActiveViewer}
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
                                    prev.digitalTwinSimulatorSendData
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
