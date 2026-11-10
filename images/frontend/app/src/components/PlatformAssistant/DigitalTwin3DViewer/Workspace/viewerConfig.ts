// The configuration of the Viewer of a digital twin as a file (.json): the group's layout (slides, panels, time)
// and the twin's lighting. It is downloaded from the Viewer, and loaded in the Viewer (to edit it) or with the
// digital twin when it is created or edited (it replaces the group's layout and the twin's lighting).
//
// {
//   "format": "osi4iot-viewer-config", "version": 1, "exportedAt": "2026-11-10T19:30:00.000Z",
//   "source": { "digitalTwinUid": "...", "description": "..." },
//   "viewerSettings": { "lighting": { "lightingPreset": "studio", ... } },
//   "layout": { "version": 2, "time": {...}, "slides": [...] }
// }
//
// Another twin can use the file: what it names that the twin does not have (sensors, image topics) is told as a
// warning, and those panels show nothing.
import { LIGHTING_KEYS, LightingOptions, sanitizeLighting } from "../Utils/lighting";
import { ChartSeriesRef, DEVICE_IMAGE_SOURCE, WorkspaceLayout, panelTitle, sanitizeWorkspaceLayout } from "./workspaceLayout";

export const VIEWER_CONFIG_FORMAT = "osi4iot-viewer-config";
export const VIEWER_CONFIG_VERSION = 1;
// as the layouts admin_api accepts (1 MB), and the lighting
export const VIEWER_CONFIG_MAX_BYTES = 1_100_000;

export interface ViewerConfig {
    format: typeof VIEWER_CONFIG_FORMAT;
    version: number;
    exportedAt: string;
    source?: { digitalTwinUid?: string; description?: string };
    viewerSettings?: { lighting?: Partial<LightingOptions> };
    layout?: WorkspaceLayout;
}

export const buildViewerConfig = ({
    layout,
    lighting,
    digitalTwinUid,
    description,
    now = new Date(),
}: {
    layout: WorkspaceLayout;
    lighting: Partial<LightingOptions>;
    digitalTwinUid?: string;
    description?: string;
    now?: Date;
}): ViewerConfig => ({
    format: VIEWER_CONFIG_FORMAT,
    version: VIEWER_CONFIG_VERSION,
    exportedAt: now.toISOString(),
    source: {
        ...(digitalTwinUid ? { digitalTwinUid } : {}),
        ...(description ? { description } : {}),
    },
    viewerSettings: { lighting: sanitizeLighting(lighting) },
    layout,
});

export const viewerConfigFileName = (digitalTwinUid: string | undefined, now = new Date()) =>
    `${(digitalTwinUid || "digital_twin").replace(/[^A-Za-z0-9_.-]+/g, "_")}_viewer_config_${now.toISOString().slice(0, 10)}.json`;

// What a file brings, checked as the Viewer and admin_api check it
export interface ParsedViewerConfig {
    layout: WorkspaceLayout | null;
    lighting: Partial<LightingOptions> | null;
    source?: ViewerConfig["source"];
    exportedAt?: string;
    // what was left out or may not work
    warnings: string[];
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

export const parseViewerConfig = (text: string): ParsedViewerConfig | { error: string } => {
    if (text.length > VIEWER_CONFIG_MAX_BYTES) return { error: "The file is too big for a viewer configuration (1 MB at most)." };
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { error: "The file is not valid JSON." };
    }
    if (!plainObject(raw) || raw.format !== VIEWER_CONFIG_FORMAT) {
        return { error: `This is not a viewer configuration (its "format" must be "${VIEWER_CONFIG_FORMAT}").` };
    }
    if (typeof raw.version !== "number" || raw.version < 1) return { error: "The file has no valid version." };
    if (raw.version > VIEWER_CONFIG_VERSION) {
        return { error: `The file is of a newer version (${raw.version}) than this platform reads (${VIEWER_CONFIG_VERSION}).` };
    }
    const warnings: string[] = [];

    let layout: WorkspaceLayout | null = null;
    if (raw.layout !== undefined && raw.layout !== null) {
        // the model panels are kept: whether the twin has a 3D model is seen when the viewer opens
        layout = sanitizeWorkspaceLayout(raw.layout, { hasModel: true });
        if (!layout) warnings.push("Its layout is not valid: it is left out.");
        else {
            const rawSlides = plainObject(raw.layout) && Array.isArray(raw.layout.slides) ? raw.layout.slides.length : null;
            if (rawSlides !== null && rawSlides > layout.slides.length) {
                warnings.push(`${rawSlides - layout.slides.length} of its slides are not valid: they are left out.`);
            }
        }
    }

    let lighting: Partial<LightingOptions> | null = null;
    const rawLighting = plainObject(raw.viewerSettings) ? raw.viewerSettings.lighting : undefined;
    if (rawLighting !== undefined && rawLighting !== null) {
        if (!plainObject(rawLighting)) warnings.push("Its lighting is not valid: it is left out.");
        else {
            lighting = sanitizeLighting(rawLighting);
            const dropped = Object.keys(rawLighting).filter(
                (key) => !(key in lighting!) || !(LIGHTING_KEYS as string[]).includes(key),
            );
            if (dropped.length) warnings.push(`Lighting values not valid, left out: ${dropped.join(", ")}.`);
            if (Object.keys(lighting).length === 0) lighting = null;
        }
    }

    if (!layout && !lighting) return { error: "The file has neither a valid layout nor a valid lighting." };
    const source = plainObject(raw.source)
        ? {
              ...(typeof raw.source.digitalTwinUid === "string" ? { digitalTwinUid: raw.source.digitalTwinUid } : {}),
              ...(typeof raw.source.description === "string" ? { description: raw.source.description } : {}),
          }
        : undefined;
    return {
        layout,
        lighting,
        source,
        exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : undefined,
        warnings,
    };
};

// What the layout names that this twin does not have: the sensors' fields of the charts and the device topics of
// the Image panels (known: the asset's; unknown lists are not checked)
export const checkViewerConfigRefs = (
    layout: WorkspaceLayout,
    known: { series?: ChartSeriesRef[]; imageSources?: string[] },
): string[] => {
    const warnings: string[] = [];
    if (known.series) {
        const fields = new Set(known.series.map((s) => `${s.sensor}|${s.field}`));
        const sensors = new Set(known.series.map((s) => s.sensor));
        const missing = new Map<string, Set<string>>();
        for (const slide of layout.slides) {
            for (const panel of slide.panels) {
                if (panel.type !== "chart") continue;
                for (const s of panel.series ?? []) {
                    if (fields.has(`${s.sensor}|${s.field}`)) continue;
                    const what = sensors.has(s.sensor) ? `${s.sensor}.${s.field}` : s.sensor;
                    const where = `${slide.title} › ${panelTitle(panel)}`;
                    if (!missing.has(what)) missing.set(what, new Set());
                    missing.get(what)!.add(where);
                }
            }
        }
        for (const [what, where] of missing) {
            warnings.push(`The twin has no ${what.includes(".") ? "field" : "sensor"} ${what} (${[...where].join(", ")}).`);
        }
    }
    if (known.imageSources) {
        const sources = new Set(known.imageSources);
        for (const slide of layout.slides) {
            for (const panel of slide.panels) {
                if (panel.type !== "image" || !panel.source || !DEVICE_IMAGE_SOURCE.test(panel.source)) continue;
                if (!sources.has(panel.source)) {
                    warnings.push(`The asset has no ${panel.source} (${slide.title} › ${panelTitle(panel)}): the panel shows its images when they arrive.`);
                }
            }
        }
    }
    return warnings;
};

// The file to the user's computer
export const downloadViewerConfig = (config: ViewerConfig, fileName: string) => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// A short description of what a file brings
export const describeViewerConfig = (parsed: ParsedViewerConfig): string => {
    const parts: string[] = [];
    if (parsed.layout) {
        const panels = parsed.layout.slides.reduce((n, s) => n + s.panels.length, 0);
        parts.push(`${parsed.layout.slides.length} ${parsed.layout.slides.length === 1 ? "slide" : "slides"}, ${panels} ${panels === 1 ? "panel" : "panels"}`);
    }
    if (parsed.lighting) parts.push(`lighting "${parsed.lighting.lightingPreset ?? "custom"}"`);
    return parts.join(" · ");
};
