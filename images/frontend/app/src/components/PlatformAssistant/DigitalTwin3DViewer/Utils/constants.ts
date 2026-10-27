import * as THREE from "three";
import { getDomainName, getNatsSeedServers, getProtocol, giveDefaultNumWebWorkers } from "../../../../tools/tools";

// three.js >= r152 gestiona el color de forma "lineal" (ColorManagement activado): los colores
// hexadecimales/CSS definidos en el código se interpretan como sRGB y se muestran tal cual.
// En three r137 se interpretaban como lineales, por lo que se veían más claros/desaturados.
// Pon true para recuperar el aspecto antiguo (R3F <Canvas legacy />).
export const LEGACY_COLOR_MANAGEMENT = false;
// Se aplica aquí (al cargar el módulo) para que la LUT de resultados FEM y el resto de colores
// creados fuera del <Canvas> usen el mismo modo que el visor.
THREE.ColorManagement.enabled = !LEGACY_COLOR_MANAGEMENT;

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

export const DOMAIN_NAME = getDomainName();
export const PROTOCOL = getProtocol();
export const NATS_SEED_SERVERS = getNatsSeedServers();

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
    // longitud de las líneas de los ejes respecto a la automática (las puntas de flecha no cambian)
    axesScale: 1,
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