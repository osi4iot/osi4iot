// The platform skill viewer-ui-options (admin_api, skill/builtinSkills.ts) tells the AI agent which viewer
// options it can change from the chat. Every option of ViewerOptions must be in it, or the agent will not
// know it exists. These records do not compile when ViewerOptions (or a visibility state) gains or loses a
// key: add it here and document it in the skill.
import { describe, expect, it } from "vitest";
import type { ViewerOptions } from "../Types/types";
import type { FemSimObjectVisibilityState, ObjectVisibilityState } from "../ViewerTools/ViewerUtils";
import { DEFAULT_VIEWER_OPTIONS } from "../Utils/constants";

const VIEWER_OPTIONS: Record<keyof ViewerOptions, true> = {
    lightingPreset: true,
    environment: true,
    environmentIntensity: true,
    environmentRotation: true,
    environmentBackground: true,
    backgroundBlur: true,
    toneMapping: true,
    exposure: true,
    keyLight: true,
    keyLightIntensity: true,
    keyLightFollowsCamera: true,
    contactShadows: true,
    ambientOcclusion: true,
    bloom: true,
    bloomIntensity: true,
    thinGlass: true,
    cameraProjection: true,
    cameraFov: true,
    ambientLight: true,
    ambientLightIntensity: true,
    spotLight: true,
    spotLightPower: true,
    showSpotLightHelper: true,
    pointLight: true,
    pointLightPower: true,
    showPointLightHelper: true,
    showAxes: true,
    axesScale: true,
    showShadows: true,
    sensorsOpacity: true,
    highlightAllSensors: true,
    showAllSensorsMarker: true,
    showOccludedSensorMarkers: true,
    hideAllSensors: true,
    sensorsVisibilityState: true,
    assetsOpacity: true,
    highlightAllAssets: true,
    hideAllAssets: true,
    assetsVisibilityState: true,
    animatedObjectsOpacity: true,
    highlightAllAnimatedObjects: true,
    hideAllAnimatedObjects: true,
    animatedObjectsVisibilityState: true,
    genericObjectsOpacity: true,
    genericObjectsShowDeepObjects: true,
    highlightAllGenericObjects: true,
    hideAllGenericObjects: true,
    genericObjectsVisibilityState: true,
    femSimulationObjectsOpacity: true,
    highlightAllFemSimulationObjects: true,
    hideAllFemSimulationObjects: true,
    femSimulationObjectsVisibilityState: true,
    hideFemSimulationLegend: true,
    femSimulationResult: true,
    femResultDate: true,
    showFemSimulationDeformation: true,
    femSimulationDefScale: true,
    showAllFemSimulationMeshes: true,
    femElemLabels: true,
    femNodeLabels: true,
    legendToShow: true,
    digitalTwinSimulatorState: true,
    numWebWorkers: true,
    enableWebWorkes: true,
    logElapsedTime: true,
};
const OBJECT_FIELDS: Record<keyof ObjectVisibilityState, true> = {
    hide: true,
    highlight: true,
    showSensorMarker: true,
    opacity: true,
    showDeepObjects: true,
};
const FEM_OBJECT_FIELDS: Record<keyof FemSimObjectVisibilityState, true> = {
    hide: true,
    showMesh: true,
    showDeformation: true,
    highlight: true,
    opacity: true,
    femSimulationResult: true,
};

// In the repository, admin_api is next to frontend (not in the frontend's own image: there the file is not
// found and the check is skipped). Node's fs is loaded by name so that the app's types need no Node types.
const nodeFs = (await import(/* @vite-ignore */ "node:" + "fs")) as {
    existsSync: (path: URL) => boolean;
    readFileSync: (path: URL, encoding: string) => string;
};
// (the base in a variable: Vite rewrites new URL("…", import.meta.url) into an asset URL)
const testFileUrl = import.meta.url;
const SKILLS_FILE = new URL("../../../../../../../admin_api/src/components/skill/builtinSkills.ts", testFileUrl);
const skillsSource = nodeFs.existsSync(SKILLS_FILE) ? nodeFs.readFileSync(SKILLS_FILE, "utf8") : undefined;

const viewerSkill = () => {
    const source = skillsSource ?? "";
    const start = source.indexOf("const VIEWER_UI_OPTIONS_SKILL_MD");
    const end = source.indexOf("`;", start);
    return source.slice(start, end);
};
const missingIn = (text: string, keys: string[]) => keys.filter((key) => !new RegExp(`\\b${key}\\b`).test(text));

describe("viewer-ui-options skill", () => {
    it("the defaults have no option the type does not have", () => {
        expect(Object.keys(DEFAULT_VIEWER_OPTIONS).filter((key) => !(key in VIEWER_OPTIONS))).toEqual([]);
    });

    it.skipIf(skillsSource === undefined)("documents every viewer option", () => {
        const skill = viewerSkill();
        expect(skill.length).toBeGreaterThan(1000);
        expect(missingIn(skill, Object.keys(VIEWER_OPTIONS))).toEqual([]);
        expect(missingIn(skill, Object.keys(OBJECT_FIELDS))).toEqual([]);
        expect(missingIn(skill, Object.keys(FEM_OBJECT_FIELDS))).toEqual([]);
    });
});
