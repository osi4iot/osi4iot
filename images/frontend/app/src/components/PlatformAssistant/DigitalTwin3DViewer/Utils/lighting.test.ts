import { describe, expect, it } from "vitest";
import {
    DEFAULT_LIGHTING,
    ENVIRONMENTS,
    LIGHTING_KEYS,
    LIGHTING_PRESETS,
    lightingOf,
    presetOptions,
    sanitizeLighting,
    toneMappingOf,
    twinLighting,
    withLightingChange,
    expandLightingUpdate,
    backgroundUnderToneMapping,
    toneCurve,
    environmentCanBeBackground,
    environmentShowsAsBackground,
} from "./lighting";
import * as THREE from "three";
import { DEFAULT_VIEWER_OPTIONS } from "./constants";

// Node's fs, loaded by name so that the app's types need no Node types
const nodeFs = (await import(/* @vite-ignore */ "node:" + "fs")) as { existsSync: (path: URL) => boolean };
const testFileUrl = import.meta.url;

describe("lighting", () => {
    it("every preset sets every lighting option", () => {
        for (const [name, preset] of Object.entries(LIGHTING_PRESETS)) {
            const missing = LIGHTING_KEYS.filter((k) => k !== "lightingPreset" && !(k in preset.options));
            expect(missing, name).toEqual([]);
            expect(ENVIRONMENTS.map((e) => e.value), name).toContain(preset.options.environment);
            expect(toneMappingOf(preset.options.toneMapping).value, name).toBe(preset.options.toneMapping);
        }
    });

    it("the viewer's defaults are the default preset", () => {
        expect(lightingOf(DEFAULT_VIEWER_OPTIONS)).toEqual(DEFAULT_LIGHTING);
        expect(DEFAULT_LIGHTING.lightingPreset).toBe("studio");
    });

    it("classic keeps the former look", () => {
        const classic = presetOptions("classic");
        expect(classic).toMatchObject({
            environment: "sunset",
            toneMapping: "aces",
            exposure: 1.5,
            ambientLight: true,
            ambientLightIntensity: 1,
            spotLight: true,
            spotLightPower: 5,
            pointLight: true,
            pointLightPower: 5,
            showShadows: true,
            keyLight: false,
        });
    });

    it("the HDR files are in the public folder (so they are in the image)", () => {
        for (const env of ENVIRONMENTS.filter((e) => e.file)) {
            const url = new URL(`../../../../../public/${env.file}`, testFileUrl);
            expect(nodeFs.existsSync(url), env.file).toBe(true);
        }
    });

    it("the saved lighting of a twin is checked key by key", () => {
        expect(sanitizeLighting(null)).toEqual({});
        expect(sanitizeLighting("x")).toEqual({});
        const clean = sanitizeLighting({
            environment: "warehouse",
            exposure: 99, // clamped
            keyLight: "yes", // wrong type: left out
            toneMapping: "filmic-unknown", // not a mode: left out
            environmentRotation: 90,
            unknown: 1,
        });
        expect(clean).toEqual({ environment: "warehouse", exposure: 5, environmentRotation: 90 });
        expect(twinLighting({ lighting: clean })).toMatchObject({ ...DEFAULT_LIGHTING, ...clean });
        expect(twinLighting(undefined)).toEqual(DEFAULT_LIGHTING);
    });

    it("a lighting change by hand makes the preset custom; other changes do not", () => {
        const opts = { ...DEFAULT_LIGHTING, showAxes: false };
        expect(withLightingChange({ ...opts, exposure: 2 }, "exposure").lightingPreset).toBe("custom");
        expect(withLightingChange({ ...opts, showAxes: true }, "showAxes").lightingPreset).toBe("studio");
        expect(withLightingChange({ ...opts, lightingPreset: "night" }, "lightingPreset").lightingPreset).toBe("night");
    });

    it("from the chat: a preset brings its options; loose lighting keys make it custom", () => {
        const night = expandLightingUpdate({ lightingPreset: "night", showAllSensorsMarker: true });
        expect(night).toMatchObject({ lightingPreset: "night", environment: "night", bloom: true, showAllSensorsMarker: true });
        const tuned = expandLightingUpdate({ lightingPreset: "industrial", exposure: 2 });
        expect(tuned).toMatchObject({ environment: "warehouse", exposure: 2, lightingPreset: "custom" });
        expect(expandLightingUpdate({ exposure: 1.4 })).toEqual({ exposure: 1.4, lightingPreset: "custom" });
        expect(expandLightingUpdate({ hideAllSensors: true })).toEqual({ hideAllSensors: true });
        expect(expandLightingUpdate({ lightingPreset: "unknown" })).toEqual({ lightingPreset: "unknown" });
    });

    it("with post-processing the background is the colour that tone maps to the container's", () => {
        const wanted = new THREE.Color("#212121");
        for (const mode of ["neutral", "agx", "aces", "linear"]) {
            for (const exposure of [0.5, 1, 1.5, 2.5]) {
                const bg = backgroundUnderToneMapping("#212121", mode, exposure);
                const shown = toneCurve(mode, bg.r * exposure);
                expect(Math.abs(shown - wanted.r), `${mode} ×${exposure}`).toBeLessThan(1e-6);
                expect(bg.r).toBeCloseTo(bg.g, 9);
            }
        }
        // the curves are increasing (the inversion needs it)
        for (const mode of ["neutral", "agx", "aces", "linear"]) {
            let last = -1;
            for (let v = 0; v < 8; v += 0.01) {
                const y = toneCurve(mode, v);
                expect(y, `${mode} at ${v}`).toBeGreaterThanOrEqual(last - 1e-9);
                last = y;
            }
        }
    });

    it("every environment but none can be the background", () => {
        expect(ENVIRONMENTS.filter((e) => !environmentCanBeBackground(e.value)).map((e) => e.value)).toEqual(["none"]);
        expect(environmentShowsAsBackground({ environment: "neutral", environmentBackground: true })).toBe(true);
        expect(environmentShowsAsBackground({ environment: "none", environmentBackground: true })).toBe(false);
        expect(environmentShowsAsBackground({ environment: "studio", environmentBackground: false })).toBe(false);
    });
});
