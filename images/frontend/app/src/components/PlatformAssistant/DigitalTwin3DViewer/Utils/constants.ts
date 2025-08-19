import * as THREE from "three";
import { getDomainName, getProtocol, giveDefaultNumWebWorkers } from "../../../../tools/tools";

export const ENVIRONMENT_OPTIONS = [
    "none",
    "sunset", 
    "dawn",
    "night"
];

export const OPACITY_SERIE = [1, 0.15, 0.1, 0.05, 0.0];

export const MOUSE_BUTTONS = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.DOLLY,
};

export const DAT_GUI_STYLE = {
    marginTop: "256px",
    button: {
        borderLeft: "0px",
    },
};

export const DOMAIN_NAME = getDomainName();
export const PROTOCOL = getProtocol();

export const DEFAULT_VIEWER_OPTIONS = {
    environment: "sunset",
    ambientLight: true,
    ambientLightIntensity: 1,
    spotLight: true,
    spotLightPower: 5,
    showSpotLightHelper: false,
    pointLight: true,
    pointLightPower: 5,
    showPointLightHelper: false,
    showAxes: false,
    showShadows: true,
    sensorsOpacity: 1,
    highlightAllSensors: false,
    showAllSensorsMarker: false,
    hideAllSensors: false,
    assetsOpacity: 1,
    highlightAllAssets: false,
    hideAllAssets: false,
    animatedObjectsOpacity: 1,
    highlightAllAnimatedObjects: false,
    hideAllAnimatedObjects: false,
    genericObjectsOpacity: 1,
    genericObjectsShowDeepObjects: false,
    highlightAllGenericObjects: false,
    hideAllGenericObjects: false,
    femSimulationObjectsOpacity: 1,
    highlightAllFemSimulationObjects: false,
    hideAllFemSimulationObjects: false,
    hideFemSimulationLegend: false,
    femSimulationResult: "None result",
    showFemSimulationDeformation: false,
    femSimulationDefScale: 0,
    showAllFemSimulationMeshes: false,
    femElemLabels: [],
    femNodeLabels: [],
    legendToShow: "None result",
    numWebWorkers: giveDefaultNumWebWorkers(),
    enableWebWorkes: true,
    logElapsedTime: false,
};

export const BUTTON_LABELS = {
    LOCK_READ_MEASUREMENTS: "LOCK READ MEASUREMENTS",
    UNLOCK_READ_MEASUREMENTS: "UNLOCK READ MEASUREMENTS", 
    GET_LAST_MEASUREMENTS: "GET LAST MEASUREMENTS",
    LOADING: "LOADING...",
};