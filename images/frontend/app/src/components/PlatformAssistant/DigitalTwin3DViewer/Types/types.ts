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
    assetWithMobilePhotoSelected: boolean;
}

export interface ViewerState {
    // UI state
    isControlPanelOpen: boolean;
    isChatAssistantOpen: boolean;
    isPipelineLogsOpen: boolean;
    showDtSimulatorModal: boolean;
    activeViewer: "3D" | "pipeline" | "image_frame";

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
    environment: string;
    ambientLight: boolean;
    ambientLightIntensity: number;
    spotLight: boolean;
    spotLightPower: number;
    showSpotLightHelper: boolean;
    pointLight: boolean;
    pointLightPower: number;
    showPointLightHelper: boolean;
    showAxes: boolean;
    showShadows: boolean;
    sensorsOpacity: number;
    highlightAllSensors: boolean;
    showAllSensorsMarker: boolean;
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

export interface ChatMessage {
    userName: string;
    message: string;
    sender: "user" | "assistant" | "mcphost";
    mcpToolCalls: McpToolCall[];
    time: string;
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
