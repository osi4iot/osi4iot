import * as THREE from "three";
import React, { FC, useRef, useLayoutEffect, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import {
    AssetState,
    FemSimObjectVisibilityState,
    FemSimulationObjectState,
    GenericObjectState,
    IDigitalTwinGltfData,
    ObjectVisibilityState,
    onMeshMouseEnter,
    onMeshMouseExit,
    onMouseClick,
    onMouseDown,
    onMouseMove,
    onTouch,
    SensorState,
    setParameters,
} from "../ViewerTools/ViewerUtils";
import Lut from "../Utils/Lut";
import { IThreeMesh } from "../Types/threeInterfaces";
import Sensors from "../Objects/Sensors";
import GenericObjects from "../Objects/GenericObjects";
import Assets from "../Objects/Assets";
import FemSimulationObjects from "../Objects/FemSimulationObjects";
import { LlmMessage } from "../ChatAssitant/ChatAssistant";
import { PipelineLog } from "../Pipeline/PipelineLogs";
import { ChatMessage } from "../Types/types";

const GroupComponent = 'group' as any;

export interface ISensorObject {
    node: IThreeMesh;
    collectionName: string;
}

export interface IAssetObject {
    node: IThreeMesh;
    collectionName: string;
}

export interface IGenericObject {
    node: IThreeMesh;
    collectionName: string;
}

export interface IResultRenderInfo {
    resultLut: Lut;
    legendCamera: THREE.PerspectiveCamera;
    legendScene: THREE.Scene;
    legendRenderer: THREE.WebGLRenderer;
}

export interface IFemSimulationObject {
    node: IThreeMesh;
    originalGeometry: Float32Array;
    wireFrameMesh: THREE.LineSegments;
    collectionName: string;
    femResultMaterial: THREE.MeshLambertMaterial;
    originalMaterial: THREE.MeshStandardMaterial;
}

export interface IMeasurement {
    timestamp: number;
    topic: string;
    payload: string;
    totalRows?: number;
}

export interface IMqttTopicData {
    topicId: number;
    topicRef: string;
    mqttTopic: string;
    lastMeasurement: IMeasurement | null;
}

interface ModelProps {
    digitalTwinGltfData: IDigitalTwinGltfData;
    femResultData: any;
    sensorObjects: ISensorObject[];
    initialSensorsState: Record<string, SensorState>;
    sensorsVisibilityState: Record<string, ObjectVisibilityState>;
    assetObjects: IAssetObject[];
    initialAssetsState: Record<string, AssetState>;
    assetsVisibilityState: Record<string, ObjectVisibilityState>;
    animatedObjectsVisibilityState: Record<string, ObjectVisibilityState>;
    femSimulationObjects: IFemSimulationObject[];
    femSimulationGeneralInfo: Record<string, IResultRenderInfo>;
    initialFemSimObjectsState: FemSimulationObjectState[];
    femSimulationObjectsVisibilityState: Record<string, FemSimObjectVisibilityState>;
    femElemLabels: number[];
    femNodeLabels: number[];
    genericObjects: IGenericObject[];
    initialGenericObjectsState: Record<string, GenericObjectState>;
    genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
    mqttTopicsData: IMqttTopicData[];
    topicIdBySensorRef: Record<string, number>;
    dashboardUrl: string;
    sensorsOpacity: number;
    highlightAllSensors: boolean;
    showAllSensorsMarker: boolean;
    hideAllSensors: boolean;
    assetsOpacity: number;
    highlightAllAssets: boolean;
    hideAllAssets: boolean;
    animatedObjectsOpacity: number;
    highlightAllAnimatedObjects: boolean;
    hideAllAnimatedObjects: boolean;
    femSimulationObjectsOpacity: number;
    hideAllFemSimulationObjects: boolean;
    highlightAllFemSimulationObjects: boolean;
    showAllFemSimulationMeshes: boolean;
    genericObjectsOpacity: number;
    genericObjectsShowDeepObjects: boolean;
    highlightAllGenericObjects: boolean;
    hideAllGenericObjects: boolean;
    canvasRef: React.MutableRefObject<null>;
    selectedObjTypeRef: React.MutableRefObject<null>;
    selectedObjNameRef: React.MutableRefObject<null>;
    selectedObjCollectionNameRef: React.MutableRefObject<null>;
    femSimulationResult: string;
    showFemSimulationDeformation: boolean;
    femSimulationDefScale: number;
    digitalTwinSimulatorState: Record<string, number>;
    digitalTwinSimulatorSendData: boolean;
    setFemMinValues: React.Dispatch<React.SetStateAction<number[]>>;
    setFemMaxValues: React.Dispatch<React.SetStateAction<number[]>>;
    setFemResFilesLastUpdate: (femResFilesLastUpdate: Date) => void;
    initialDigitalTwinSimulatorState: Record<string, number>;
    openDashboardTab: (url: string) => void;
    setFemResultLoaded: (femResultLoaded: boolean) => void;
    femResultNames: string[];
    enableWebWorkes: boolean;
    numWebWorkers: number;
    logElapsedTime: boolean;
    setDigitalTwinState: React.Dispatch<React.SetStateAction<string>>;
    isChatAssistantOpen: boolean;
    chatMessages: ChatMessage[];
    showDtSimulatorModal: boolean;
    handleUpdateChatAssistantMessages: (newMessage: LlmMessage) => void;
    handleUpdateLogMessages: (newLogMessages: PipelineLog) => void;

    currentSensorsState: Record<string, SensorState>;
    currentAssetsState: Record<string, AssetState>;
    currentGenericObjectsState: Record<string, GenericObjectState>;
    currentFemSimulationObjectsState: FemSimulationObjectState[];
    setCurrentSensorsState: React.Dispatch<React.SetStateAction<Record<string, SensorState>>>;
    setCurrentAssetsState: React.Dispatch<React.SetStateAction<Record<string, AssetState>>>;
    setCurrentGenericObjectsState: React.Dispatch<React.SetStateAction<Record<string, GenericObjectState>>>;
    setCurrentFemSimulationObjectsState: React.Dispatch<React.SetStateAction<FemSimulationObjectState[]>>;
}

const Model: FC<ModelProps> = ({
    digitalTwinGltfData,
    femResultData,
    sensorObjects,
    sensorsVisibilityState,
    assetObjects,
    assetsVisibilityState,
    femSimulationObjects,
    femSimulationGeneralInfo,
    femSimulationObjectsVisibilityState,
    femElemLabels,
    femNodeLabels,
    genericObjects,
    genericObjectsVisibilityState,
    sensorsOpacity,
    highlightAllSensors,
    showAllSensorsMarker,
    hideAllSensors,
    assetsOpacity,
    highlightAllAssets,
    hideAllAssets,
    femSimulationObjectsOpacity,
    hideAllFemSimulationObjects,
    highlightAllFemSimulationObjects,
    showAllFemSimulationMeshes,
    genericObjectsOpacity,
    genericObjectsShowDeepObjects,
    highlightAllGenericObjects,
    hideAllGenericObjects,
    canvasRef,
    selectedObjTypeRef,
    selectedObjNameRef,
    selectedObjCollectionNameRef,
    femSimulationResult,
    showFemSimulationDeformation,
    femSimulationDefScale,
    setFemMinValues,
    setFemMaxValues,
    openDashboardTab,
    setFemResultLoaded,
    femResultNames,
    enableWebWorkes,
    numWebWorkers,
    logElapsedTime,

    // Nuevas props - Estados del padre
    currentSensorsState,
    currentAssetsState,
    currentGenericObjectsState,
    currentFemSimulationObjectsState,
    setCurrentSensorsState,
    setCurrentAssetsState,
    setCurrentGenericObjectsState,
    setCurrentFemSimulationObjectsState,
}) => {
    const camera = useThree((state) => state.camera);
    const container = canvasRef.current as HTMLCanvasElement | null;
    const group = useRef<THREE.Group | undefined>(undefined);

    const sensorsState = currentSensorsState;
    const setSensorsState = setCurrentSensorsState;
    const assetsState = currentAssetsState;
    const setAssetsState = setCurrentAssetsState;
    const genericObjectsState = currentGenericObjectsState;
    const setGenericObjectsState = setCurrentGenericObjectsState;
    const femSimulationObjectsState = currentFemSimulationObjectsState;
    const setFemSimulationObjectsState = setCurrentFemSimulationObjectsState;

    const updateSensorStateString = useCallback(
        (objName: string, state: string) => {
            setSensorsState((prevState) => {
                return {
                    ...prevState,
                    [objName]: { ...prevState[objName], stateString: state },
                };
            });
        },
        [setSensorsState],
    );

    useLayoutEffect(() => {
        const changeObjectHighlight = (objType: string, objName: string, highlighted: boolean) => {
            let highlightSensor = false;
            let highlightAsset = false;
            let highlightGenericObject = false;
            let highlightFemSimulationObject = false;
            if (objType === "sensor" && highlighted) highlightSensor = true;
            else if (objType === "asset" && highlighted) highlightAsset = true;
            else if (objType === "generic" && highlighted) highlightGenericObject = true;
            else if (objType === "femObject" && highlighted) highlightFemSimulationObject = true;

            setSensorsState((prevSensorsState) => {
                const newSensorState = { ...prevSensorsState };
                for (const objLabel in newSensorState) {
                    if (objType === "sensor" && objLabel === objName) {
                        newSensorState[objLabel] = {
                            ...newSensorState[objLabel],
                            highlight: highlightSensor,
                        };
                    } else {
                        newSensorState[objLabel] = {
                            ...newSensorState[objLabel],
                            highlight: false,
                        };
                    }
                }
                return newSensorState;
            });

            setAssetsState((prevAssetsState) => {
                const newAssetsState = { ...prevAssetsState };
                for (const objLabel in newAssetsState) {
                    if (objType === "asset" && objLabel === objName) {
                        newAssetsState[objLabel] = {
                            ...newAssetsState[objLabel],
                            highlight: highlightAsset,
                        };
                    } else {
                        newAssetsState[objLabel] = {
                            ...newAssetsState[objLabel],
                            highlight: false,
                        };
                    }
                }
                return newAssetsState;
            });

            setGenericObjectsState((prevGenericObjectState) => {
                const newGenericObjectsState = { ...prevGenericObjectState };
                for (const objLabel in newGenericObjectsState) {
                    if (objType === "generic" && objLabel === objName) {
                        newGenericObjectsState[objLabel] = {
                            ...newGenericObjectsState[objLabel],
                            highlight: highlightGenericObject,
                        };
                    } else {
                        newGenericObjectsState[objLabel] = {
                            ...newGenericObjectsState[objLabel],
                            highlight: false,
                        };
                    }
                }
                return newGenericObjectsState;
            });

            setFemSimulationObjectsState((prevFemSimulationObjectState) => {
                const newFemSimulationObjectsState = [...prevFemSimulationObjectState];
                for (let imesh = 0; imesh < newFemSimulationObjectsState.length; imesh++) {
                    if (objType === "femObject" && femSimulationObjects[imesh].node.name === objName) {
                        newFemSimulationObjectsState[imesh] = {
                            ...newFemSimulationObjectsState[imesh],
                            highlight: highlightFemSimulationObject,
                        };
                    } else {
                        newFemSimulationObjectsState[imesh] = {
                            ...newFemSimulationObjectsState[imesh],
                            highlight: false,
                        };
                    }
                }
                return newFemSimulationObjectsState;
            });
        };

        setParameters(
            camera,
            container,
            selectedObjTypeRef.current as HTMLDivElement | null,
            selectedObjNameRef.current as HTMLDivElement | null,
            selectedObjCollectionNameRef.current as HTMLDivElement | null,
            changeObjectHighlight,
            digitalTwinGltfData.sensorsDashboards,
            openDashboardTab,
        );
        window.addEventListener("mesh_mouse_enter", onMeshMouseEnter, false);
        window.addEventListener("mesh_mouse_exit", onMeshMouseExit, false);
        container?.addEventListener("click", onMouseClick, false);
        container?.addEventListener("mousemove", onMouseMove, false);
        container?.addEventListener("mousedown", onMouseDown, false);
        container?.addEventListener("touchstart", onTouch, false);

        return () => {
            container?.removeEventListener("mesh_mouse_enter", onMeshMouseEnter);
            container?.removeEventListener("mesh_mouse_exit", onMeshMouseExit);
            container?.removeEventListener("mousemove", onMouseMove);
            container?.removeEventListener("mousedown", onMouseDown);
            container?.removeEventListener("touchstart", onTouch);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera, container, setSensorsState, setAssetsState, setGenericObjectsState, setFemSimulationObjectsState]);

    return (
        <GroupComponent ref={group as React.MutableRefObject<THREE.Group>} dispose={null}>
            {sensorObjects.length !== 0 && sensorsState && sensorsVisibilityState && (
                <Sensors
                    sensorObjects={sensorObjects}
                    sensorsOpacity={sensorsOpacity}
                    highlightAllSensors={highlightAllSensors}
                    showAllSensorsMarker={showAllSensorsMarker}
                    hideAllSensors={hideAllSensors}
                    sensorsState={sensorsState}
                    sensorsVisibilityState={sensorsVisibilityState}
                    updateSensorStateString={updateSensorStateString}
                    sensorsDashboards={digitalTwinGltfData.sensorsDashboards}
                    openDashboardTab={openDashboardTab}
                />
            )}
            {assetObjects.length !== 0 && assetsState && (
                <Assets
                    assetObjects={assetObjects}
                    assetsOpacity={assetsOpacity}
                    highlightAllAssets={highlightAllAssets}
                    hideAllAssets={hideAllAssets}
                    assetsState={assetsState}
                    assetsVisibilityState={assetsVisibilityState}
                />
            )}
            {genericObjects.length !== 0 && genericObjectsState && genericObjectsVisibilityState && (
                <GenericObjects
                    genericObjects={genericObjects}
                    genericObjectsOpacity={genericObjectsOpacity}
                    genericObjectsShowDeepObjects={genericObjectsShowDeepObjects}
                    highlightAllGenericObjects={highlightAllGenericObjects}
                    hideAllGenericObjects={hideAllGenericObjects}
                    genericObjectsState={genericObjectsState}
                    genericObjectsVisibilityState={genericObjectsVisibilityState}
                />
            )}
            {femSimulationObjects.length !== 0 && femSimulationObjectsState.length !== 0 && femResultData && (
                <FemSimulationObjects
                    femSimulationGeneralInfo={femSimulationGeneralInfo}
                    digitalTwinGltfData={digitalTwinGltfData}
                    femResultData={femResultData}
                    femSimulationObjects={femSimulationObjects}
                    femSimulationObjectsOpacity={femSimulationObjectsOpacity}
                    highlightAllFemSimulationObjects={highlightAllFemSimulationObjects}
                    hideAllFemSimulationObjects={hideAllFemSimulationObjects}
                    femSimulationObjectsState={femSimulationObjectsState}
                    femSimulationResult={femSimulationResult}
                    showFemAllMeshes={showAllFemSimulationMeshes}
                    showFemSimulationDeformation={showFemSimulationDeformation}
                    femSimulationDefScale={femSimulationDefScale}
                    femSimulationObjectsVisibilityState={femSimulationObjectsVisibilityState}
                    femElemLabels={femElemLabels}
                    femNodeLabels={femNodeLabels}
                    setFemMaxValues={setFemMaxValues}
                    setFemMinValues={setFemMinValues}
                    setFemResultLoaded={setFemResultLoaded}
                    femResultNames={femResultNames}
                    enableWebWorkes={enableWebWorkes}
                    numWebWorkers={numWebWorkers}
                    logElapsedTime={logElapsedTime}
                    onlyFemObjects={
                        sensorObjects.length === 0 && assetObjects.length === 0 && genericObjects.length === 0
                    }
                />
            )}
        </GroupComponent>
    );
};

export default Model;
