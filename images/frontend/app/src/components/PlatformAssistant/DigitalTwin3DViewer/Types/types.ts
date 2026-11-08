import * as THREE from "three";
import {
    IDigitalTwinGltfData,
    SensorState,
    AssetState,
    GenericObjectState,
    FemSimulationObjectState,
    ObjectVisibilityState,
    FemSimObjectVisibilityState,
} from "../ViewerTools/ViewerUtils";
import { IAssetObject, IFemSimulationObject, IGenericObject, ISensorObject } from "../Main/Model";
import { IDigitalTwin } from "../../TableColumns/digitalTwinsColumns";
import { IResultRenderInfo } from "../Main/Model";
import { McpToolCall } from "../ChatAssitant/ChatAssistant";
import { IOrgOfGroupsManaged } from "../../TableColumns/orgsOfGroupsManagedColumns";
import { IGroupManaged } from "../../TableColumns/groupsManagedColumns";
import IAssetS3Folder from "../../TableColumns/assetS3FolderColumns";

export interface SelectedObjectInfo {
    type: string;
    name: string;
    dashboardId: string;
    topicId: string;
}

export interface Viewer3DProps {
    digitalTwinSelected: IDigitalTwin | null;
    digitalTwinGltfData: IDigitalTwinGltfData;
    assetS3Folders: IAssetS3Folder[];
    orgSelected: IOrgOfGroupsManaged | null;
    groupSelected: IGroupManaged | null;
    close3DViewer: () => void;
    fetchFemResFileWorker: Worker;
    refreshDigitalTwins: () => void;
    assetWithCameraSelected: boolean;
    sensorWithCameraSelected: boolean;
}

export interface ViewerState {
    // UI state
    isAssistantPanelOpen: boolean;
    isChatAssistantOpen: boolean;
    isPipelineLogsOpen: boolean;
    showDtSimulatorModal: boolean;
    activeViewer: "3D" | "pipeline"; // "3D": the Viewer page (3D model and/or Image)

    // Digital Twin state
    digitalTwinState: string;
    digitalTwinSimulatorSendData: boolean;
    generalTransparencyIndex: number;

    // Objects state
    sensorObjects: ISensorObject[];
    sensorCollectionNames: string[];
    assetObjects: IAssetObject[];
    assetCollectionNames: string[];
    genericObjects: IGenericObject[];
    genericObjectCollectionNames: string[];
    femSimulationObjects: IFemSimulationObject[];
    femSimObjectCollectionNames: string[];

    // Initial states
    initialSensorsState: Record<string, SensorState> | null;
    initialAssetsState: Record<string, AssetState> | null;
    initialGenericObjectsState: Record<string, GenericObjectState> | null;
    initialFemSimObjectsState: FemSimulationObjectState[];
    initialDigitalTwinSimulatorState: Record<string, number>;

    // Visibility states
    initialGenericObjectsVisibilityState: Record<string, ObjectVisibilityState> | null;
    initialSensorsVisibilityState: Record<string, ObjectVisibilityState> | null;
    initialAssetsVisibilityState: Record<string, ObjectVisibilityState> | null;
    initialFemSimObjectsVisibilityState: Record<string, FemSimObjectVisibilityState> | null;

    // FEM simulation state
    femSimulationGeneralInfo: Record<string, IResultRenderInfo> | null;
    femMinValues: number[];
    femMaxValues: number[];
    femResultDates: string[];
    femResultFileNames: string[];
    femResultNames: string[];
    femResultData: any;
    femResultLoaded: boolean;
    femResFilesLastUpdate: Date;

    // Button labels
    lockReadingButtomLabel: string;
    getLastMeasurementsButtomLabel: string;

    // Renderer
    legendRenderer: THREE.WebGLRenderer | null;

    // Pipeline state
    isPipelineUiChanged: boolean;
}

export interface ViewerOptions {
    // one-click lighting (Utils/lighting.ts LIGHTING_PRESETS) or "custom" once a lighting option is changed
    lightingPreset: string;
    environment: string;
    environmentIntensity: number;
    // degrees around the vertical axis
    environmentRotation: number;
    // the environment as the background, blurred by backgroundBlur (0-1)
    environmentBackground: boolean;
    backgroundBlur: number;
    // neutral, agx, aces or linear
    toneMapping: string;
    exposure: number;
    // directional light; it can follow the camera (lit from the viewer's side)
    keyLight: boolean;
    keyLightIntensity: number;
    keyLightFollowsCamera: boolean;
    // soft shadow under the model
    contactShadows: boolean;
    // screen-space ambient occlusion (N8AO)
    ambientOcclusion: boolean;
    // glow of emissive and very bright surfaces
    bloom: boolean;
    bloomIntensity: number;
    // glass and liquids (KHR_materials_transmission) as thin sheets: their model thickness is ignored
    thinGlass: boolean;
    // the camera: "orthographic" (no perspective: sizes do not change with the distance) or "perspective"
    cameraProjection: string;
    // vertical field of view of the perspective camera, degrees
    cameraFov: number;
    ambientLight: boolean;
    ambientLightIntensity: number;
    spotLight: boolean;
    spotLightPower: number;
    showSpotLightHelper: boolean;
    pointLight: boolean;
    pointLightPower: number;
    showPointLightHelper: boolean;
    showAxes: boolean;
    axesScale: number;
    showShadows: boolean;
    sensorsOpacity: number;
    highlightAllSensors: boolean;
    showAllSensorsMarker: boolean;
    // markers of the sensors that other objects hide from the camera: shown (true) or hidden
    showOccludedSensorMarkers?: boolean;
    hideAllSensors: boolean;
    sensorsVisibilityState: Record<string, ObjectVisibilityState>;
    assetsOpacity: number;
    highlightAllAssets: boolean;
    hideAllAssets: boolean;
    assetsVisibilityState: Record<string, ObjectVisibilityState>;
    animatedObjectsOpacity: number;
    highlightAllAnimatedObjects: boolean;
    hideAllAnimatedObjects: boolean;
    animatedObjectsVisibilityState: Record<string, ObjectVisibilityState>;
    genericObjectsOpacity: number;
    genericObjectsShowDeepObjects: boolean;
    highlightAllGenericObjects: boolean;
    hideAllGenericObjects: boolean;
    genericObjectsVisibilityState: Record<string, ObjectVisibilityState>;
    femSimulationObjectsOpacity: number;
    highlightAllFemSimulationObjects: boolean;
    hideAllFemSimulationObjects: boolean;
    femSimulationObjectsVisibilityState: Record<string, FemSimObjectVisibilityState>;
    hideFemSimulationLegend: boolean;
    femSimulationResult: string;
    femResultDate: string;
    showFemSimulationDeformation: boolean;
    femSimulationDefScale: number;
    showAllFemSimulationMeshes: boolean;
    femElemLabels: number[];
    femNodeLabels: number[];
    legendToShow: string;
    digitalTwinSimulatorState: Record<string, number>;
    numWebWorkers: number;
    enableWebWorkes: boolean;
    logElapsedTime: boolean;
}

export interface MqttOptions {
    keepalive: number;
    clientId: string;
    port: number;
    username: string;
    accessToken: string;
}

export interface INatsClientOptions {
  clientId: string;
  port: number;
  username: string;
  accessToken: string;
}

export interface ChatMessage {
    userName: string;
    message: string;
    sender: "user" | "assistant" | "system";
    mcpToolCalls: McpToolCall[];
    time: string;
    // gráficas dibujadas por pipelines para la respuesta (sensor-chart)
    charts?: { id?: string; title: string; mimeType: string; data: string }[];
    // "pipeline": pregunta de voz (sensor "Mobile audio", nota de voz de Telegram) transcrita en el pipeline, que
    // ya la ha enviado al AI Agent: el visor solo la muestra
    source?: "pipeline";
}

export interface IPipelineNode {
    id: string;
    type: string;
    position: {
        x: number;
        y: number;
    };
    data: {
        label: string;
        nodeUid: string;
        numOutputs: number;
        debug: string;
        settings: Record<string, any>;
    };
}

export interface IPipelineEdge {
    id: string;
    source: any;
    target: any;
    sourceHandle: string;
}

export interface NodeWireData {
    nodeEndUid: string;
    outputIndex: number;
}
