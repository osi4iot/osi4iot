// Lighting of the 3D viewer: environments, tone mapping, presets and the options a digital twin keeps as its
// own lighting (viewer_settings.lighting in admin_api). The HDR files are in the frontend's public folder, so
// they are always in the image.
import * as THREE from "three";
import { ToneMappingMode } from "postprocessing";

export interface LightingOptions {
    lightingPreset: string;
    environment: string;
    environmentIntensity: number;
    environmentRotation: number;
    environmentBackground: boolean;
    backgroundBlur: number;
    toneMapping: string;
    exposure: number;
    keyLight: boolean;
    keyLightIntensity: number;
    keyLightFollowsCamera: boolean;
    ambientLight: boolean;
    ambientLightIntensity: number;
    spotLight: boolean;
    spotLightPower: number;
    pointLight: boolean;
    pointLightPower: number;
    showShadows: boolean;
    contactShadows: boolean;
    ambientOcclusion: boolean;
    bloom: boolean;
    bloomIntensity: number;
    thinGlass: boolean;
}

export const LIGHTING_KEYS: (keyof LightingOptions)[] = [
    "lightingPreset",
    "environment",
    "environmentIntensity",
    "environmentRotation",
    "environmentBackground",
    "backgroundBlur",
    "toneMapping",
    "exposure",
    "keyLight",
    "keyLightIntensity",
    "keyLightFollowsCamera",
    "ambientLight",
    "ambientLightIntensity",
    "spotLight",
    "spotLightPower",
    "pointLight",
    "pointLightPower",
    "showShadows",
    "contactShadows",
    "ambientOcclusion",
    "bloom",
    "bloomIntensity",
    "thinGlass",
];

// "neutral" is generated in code (three's RoomEnvironment, a soft studio room): it needs no file
export const ENVIRONMENTS: { value: string; label: string; file?: string }[] = [
    { value: "none", label: "None" },
    { value: "neutral", label: "Neutral studio" },
    { value: "studio", label: "Photo studio", file: "studio_small_03_1k.hdr" },
    { value: "warehouse", label: "Industrial warehouse", file: "empty_warehouse_01_1k.hdr" },
    { value: "outdoor", label: "Outdoor daylight", file: "rooitou_park_1k.hdr" },
    { value: "sunset", label: "Sunset", file: "venice_sunset_1k.hdr" },
    { value: "dawn", label: "Dawn", file: "kiara_1_dawn_1k.hdr" },
    { value: "night", label: "Night", file: "dikhololo_night_1k.hdr" },
];

export const environmentFile = (environment: string) => ENVIRONMENTS.find((e) => e.value === environment)?.file;

// Every environment but "none" can be the background (the generated "neutral" studio too)
export const environmentCanBeBackground = (environment: string) =>
    environment !== "none" && ENVIRONMENTS.some((e) => e.value === environment);

// whether the environment is drawn as the background (then the viewer's background colour is not)
export const environmentShowsAsBackground = (opts: { environment: string; environmentBackground?: boolean }) =>
    !!opts.environmentBackground && environmentCanBeBackground(opts.environment);

export const TONE_MAPPINGS: { value: string; label: string; three: THREE.ToneMapping; effect: ToneMappingMode }[] = [
    { value: "neutral", label: "Neutral (Khronos)", three: THREE.NeutralToneMapping, effect: ToneMappingMode.NEUTRAL },
    { value: "agx", label: "AgX", three: THREE.AgXToneMapping, effect: ToneMappingMode.AGX },
    { value: "aces", label: "ACES Filmic", three: THREE.ACESFilmicToneMapping, effect: ToneMappingMode.ACES_FILMIC },
    { value: "linear", label: "Linear", three: THREE.LinearToneMapping, effect: ToneMappingMode.LINEAR },
];

export const toneMappingOf = (value: string) => TONE_MAPPINGS.find((t) => t.value === value) ?? TONE_MAPPINGS[0];

const OFF = {
    environmentRotation: 0,
    environmentBackground: false,
    backgroundBlur: 0.5,
    keyLight: false,
    keyLightIntensity: 2,
    keyLightFollowsCamera: false,
    ambientLight: false,
    ambientLightIntensity: 1,
    spotLight: false,
    spotLightPower: 5,
    pointLight: false,
    pointLightPower: 5,
    showShadows: false,
    contactShadows: false,
    ambientOcclusion: false,
    bloom: false,
    bloomIntensity: 0.6,
    thinGlass: false,
};

// One-click lighting. "classic" is the viewer's former look (sunset, ACES ×1.5, ambient, spot and point lights).
export const LIGHTING_PRESETS: Record<string, { label: string; options: Omit<LightingOptions, "lightingPreset"> }> = {
    studio: {
        label: "Studio",
        options: {
            ...OFF,
            environment: "neutral",
            environmentIntensity: 1,
            toneMapping: "neutral",
            exposure: 1,
            keyLight: true,
            keyLightIntensity: 2,
            keyLightFollowsCamera: true,
            contactShadows: true,
        },
    },
    industrial: {
        label: "Industrial",
        options: {
            ...OFF,
            environment: "warehouse",
            environmentIntensity: 1,
            toneMapping: "neutral",
            exposure: 1.1,
            keyLight: true,
            keyLightIntensity: 1.5,
            showShadows: true,
            contactShadows: true,
            ambientOcclusion: true,
        },
    },
    outdoor: {
        label: "Outdoor",
        options: {
            ...OFF,
            environment: "outdoor",
            environmentIntensity: 0.7,
            toneMapping: "neutral",
            exposure: 1,
            keyLight: true,
            keyLightIntensity: 3.5,
            showShadows: true,
            contactShadows: true,
        },
    },
    night: {
        label: "Night",
        options: {
            ...OFF,
            environment: "night",
            environmentIntensity: 1.5,
            toneMapping: "aces",
            exposure: 1.2,
            keyLight: true,
            keyLightIntensity: 0.6,
            keyLightFollowsCamera: true,
            contactShadows: true,
            bloom: true,
            bloomIntensity: 0.8,
        },
    },
    classic: {
        label: "Classic",
        options: {
            ...OFF,
            environment: "sunset",
            environmentIntensity: 1,
            toneMapping: "aces",
            exposure: 1.5,
            ambientLight: true,
            spotLight: true,
            pointLight: true,
            showShadows: true,
        },
    },
};

export const DEFAULT_LIGHTING_PRESET = "studio";

export const LIGHTING_PRESET_OPTIONS = [...Object.keys(LIGHTING_PRESETS), "custom"];
export const lightingPresetLabel = (value: string) => LIGHTING_PRESETS[value]?.label ?? "Custom";

export const DEFAULT_LIGHTING: LightingOptions = {
    lightingPreset: DEFAULT_LIGHTING_PRESET,
    ...LIGHTING_PRESETS[DEFAULT_LIGHTING_PRESET].options,
};

// The options of a preset ("custom" changes nothing)
export const presetOptions = (preset: string): Partial<LightingOptions> =>
    LIGHTING_PRESETS[preset] ? { lightingPreset: preset, ...LIGHTING_PRESETS[preset].options } : { lightingPreset: "custom" };

// The lighting of a set of viewer options
export const lightingOf = (opts: Partial<LightingOptions>): LightingOptions => {
    const out = { ...DEFAULT_LIGHTING } as Record<string, unknown>;
    for (const key of LIGHTING_KEYS) {
        if ((opts as Record<string, unknown>)[key] !== undefined) out[key] = (opts as Record<string, unknown>)[key];
    }
    return out as unknown as LightingOptions;
};

const NUMBER_RANGES: Partial<Record<keyof LightingOptions, [number, number]>> = {
    environmentIntensity: [0, 5],
    environmentRotation: [0, 360],
    backgroundBlur: [0, 1],
    exposure: [0.05, 5],
    keyLightIntensity: [0, 20],
    ambientLightIntensity: [0, 10],
    spotLightPower: [0, 5000],
    pointLightPower: [0, 5000],
    bloomIntensity: [0, 5],
};

// The lighting saved with a digital twin (viewer_settings.lighting), checked key by key: what is missing or
// not valid is left out, so the defaults apply.
export const sanitizeLighting = (raw: unknown): Partial<LightingOptions> => {
    if (!raw || typeof raw !== "object") return {};
    const src = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of LIGHTING_KEYS) {
        const value = src[key];
        const reference = DEFAULT_LIGHTING[key];
        if (typeof reference === "boolean" && typeof value === "boolean") out[key] = value;
        else if (typeof reference === "number" && typeof value === "number" && Number.isFinite(value)) {
            const [min, max] = NUMBER_RANGES[key] ?? [-Infinity, Infinity];
            out[key] = Math.min(max, Math.max(min, value));
        } else if (typeof reference === "string" && typeof value === "string") {
            const allowed =
                key === "environment"
                    ? ENVIRONMENTS.map((e) => e.value)
                    : key === "toneMapping"
                      ? TONE_MAPPINGS.map((t) => t.value)
                      : key === "lightingPreset"
                        ? LIGHTING_PRESET_OPTIONS
                        : [value];
            if (allowed.includes(value)) out[key] = value;
        }
    }
    return out as Partial<LightingOptions>;
};

// The lighting of a digital twin: its saved lighting over the default one
export const twinLighting = (viewerSettings: unknown): LightingOptions => {
    const saved = viewerSettings && typeof viewerSettings === "object" ? (viewerSettings as Record<string, unknown>).lighting : undefined;
    return { ...DEFAULT_LIGHTING, ...sanitizeLighting(saved) };
};

// A lighting change made by hand: the preset becomes "custom" (choosing a preset is not such a change)
export const withLightingChange = <T extends Partial<LightingOptions>>(opts: T, key: string): T =>
    key !== "lightingPreset" && (LIGHTING_KEYS as string[]).includes(key) && opts.lightingPreset !== "custom"
        ? { ...opts, lightingPreset: "custom" }
        : opts;

// The viewer options an AI agent sends from the chat (uiOpts): a lightingPreset brings all its options (the
// keys sent with it win, and then the lighting is "custom"); lighting keys sent without a preset make it
// "custom". Other keys are left as they are.
export const expandLightingUpdate = (updates: Record<string, unknown>): Record<string, unknown> => {
    const lightingKeys = Object.keys(updates).filter(
        (k) => k !== "lightingPreset" && (LIGHTING_KEYS as string[]).includes(k),
    );
    const preset = updates.lightingPreset;
    if (typeof preset === "string" && LIGHTING_PRESETS[preset]) {
        const expanded: Record<string, unknown> = { ...presetOptions(preset), ...updates };
        if (lightingKeys.length > 0) expanded.lightingPreset = "custom";
        return expanded;
    }
    if (lightingKeys.length > 0) {
        const { lightingPreset: _ignored, ...rest } = updates;
        return { ...rest, lightingPreset: "custom" };
    }
    return updates;
};

// ---- the background with post-processing ----
// Without post-processing the background colour is the clear colour: not tone mapped. With it (ambient
// occlusion, bloom), the ToneMapping effect maps the background too, and a dark grey ends up almost black. The
// background is then the colour that, once tone mapped, is the one wanted. The curves are three.js r186's
// (tonemapping_pars_fragment, also used by postprocessing's ToneMapping effect), for one channel: their
// matrices keep greys grey.
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const toneCurve = (toneMapping: string, v: number): number => {
    switch (toneMapping) {
        case "linear":
            return clamp01(v);
        case "aces": {
            const x = v / 0.6;
            const a = x * (x + 0.0245786) - 0.000090537;
            const b = x * (0.983729 * x + 0.432951) + 0.238081;
            return clamp01(a / b);
        }
        case "agx": {
            const minEv = -12.47393;
            const maxEv = 4.026069;
            const n = clamp01((Math.log2(Math.max(v, 1e-10)) - minEv) / (maxEv - minEv));
            const n2 = n * n;
            const n4 = n2 * n2;
            const y = 15.5 * n4 * n2 - 40.14 * n4 * n + 31.96 * n4 - 6.868 * n2 * n + 0.4298 * n2 + 0.1191 * n - 0.00232;
            return clamp01(Math.pow(Math.max(0, y), 2.2));
        }
        default: {
            // neutral (Khronos PBR Neutral)
            const offset = v < 0.08 ? v - 6.25 * v * v : 0.04;
            const c = v - offset;
            const start = 0.8 - 0.04;
            if (c < start) return c;
            const d = 1 - start;
            return 1 - (d * d) / (c + d - start);
        }
    }
};

// the linear value that the curve (after the exposure) turns into target
const invertTone = (toneMapping: string, exposure: number, target: number) => {
    let lo = 0;
    let hi = 64;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (toneCurve(toneMapping, mid * exposure) < target) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
};

// The background colour to give the scene so that it shows as `color` after the tone mapping
export const backgroundUnderToneMapping = (color: string, toneMapping: string, exposure: number): THREE.Color => {
    const wanted = new THREE.Color(color); // linear (three's working colour space)
    const e = exposure > 0 ? exposure : 1;
    return new THREE.Color().setRGB(
        invertTone(toneMapping, e, wanted.r),
        invertTone(toneMapping, e, wanted.g),
        invertTone(toneMapping, e, wanted.b),
        THREE.LinearSRGBColorSpace,
    );
};
