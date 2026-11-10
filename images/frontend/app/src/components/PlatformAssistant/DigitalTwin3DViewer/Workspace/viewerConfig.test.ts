import { describe, expect, it } from "vitest";
import { buildViewerConfig, checkViewerConfigRefs, describeViewerConfig, parseViewerConfig, viewerConfigFileName } from "./viewerConfig";
import { WorkspaceLayout } from "./workspaceLayout";

const layout: WorkspaceLayout = {
    version: 2,
    time: { from: "now-1h", to: "now", refresh: "5s" } as any,
    slides: [
        {
            id: "slide-1",
            title: "Overview",
            tag: "Slide_1",
            panels: [
                { id: "m", type: "model", x: 0, y: 0, w: 8, h: 12 },
                { id: "c", type: "chart", title: "Rotor", series: [{ sensor: "rotor", field: "rpm" }, { sensor: "temp", field: "t" }], x: 8, y: 0, w: 4, h: 6 },
            ],
        },
        { id: "slide-2", title: "Vision", tag: "Vision", panels: [{ id: "i", type: "image", source: "dev2dtm_3", x: 0, y: 0, w: 6, h: 6 }] },
    ],
} as WorkspaceLayout;

describe("viewer configuration file", () => {
    it("is written and read back the same", () => {
        const now = new Date("2026-11-10T19:30:00Z");
        const config = buildViewerConfig({ layout, lighting: { lightingPreset: "industrial", exposure: 1.2 }, digitalTwinUid: "OC4 twin", now });
        expect(config).toMatchObject({ format: "osi4iot-viewer-config", version: 1, exportedAt: "2026-11-10T19:30:00.000Z", source: { digitalTwinUid: "OC4 twin" } });
        const parsed = parseViewerConfig(JSON.stringify(config));
        if ("error" in parsed) throw new Error(parsed.error);
        expect(parsed.layout?.slides.map((s) => s.title)).toEqual(["Overview", "Vision"]);
        expect(parsed.layout?.slides[0].panels[1].series).toHaveLength(2);
        expect(parsed.lighting).toEqual({ lightingPreset: "industrial", exposure: 1.2 });
        expect(parsed.warnings).toEqual([]);
        expect(describeViewerConfig(parsed)).toBe('2 slides, 3 panels · lighting "industrial"');
        expect(viewerConfigFileName("OC4 twin", now)).toBe("OC4_twin_viewer_config_2026-11-10.json");
    });

    it("rejects what is not a configuration and tells what it leaves out", () => {
        expect(parseViewerConfig("{")).toEqual({ error: "The file is not valid JSON." });
        expect(parseViewerConfig(JSON.stringify(layout))).toHaveProperty("error");
        expect(parseViewerConfig(JSON.stringify({ format: "osi4iot-viewer-config", version: 7, layout }))).toHaveProperty("error");
        expect(parseViewerConfig(JSON.stringify({ format: "osi4iot-viewer-config", version: 1 }))).toHaveProperty("error");
        const parsed = parseViewerConfig(
            JSON.stringify({ format: "osi4iot-viewer-config", version: 1, layout: { version: 9 }, viewerSettings: { lighting: { exposure: 1, environment: "mars", foo: 1 } } }),
        );
        if ("error" in parsed) throw new Error(parsed.error);
        expect(parsed.layout).toBeNull();
        expect(parsed.lighting).toEqual({ exposure: 1 });
        expect(parsed.warnings).toEqual(["Its layout is not valid: it is left out.", "Lighting values not valid, left out: environment, foo."]);
    });

    it("tells the sensors and device topics this twin does not have", () => {
        const warnings = checkViewerConfigRefs(layout, { series: [{ sensor: "rotor", field: "rpm" }], imageSources: ["dev2dtm_1"] });
        expect(warnings).toEqual([
            "The twin has no sensor temp (Overview › Rotor).",
            "The asset has no dev2dtm_3 (Vision › Device (dev2dtm_3)): the panel shows its images when they arrive.",
        ]);
        expect(checkViewerConfigRefs(layout, {})).toEqual([]);
    });
});
