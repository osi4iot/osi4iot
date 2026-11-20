import { describe, expect, it } from "vitest";
import {
    ASSET_STATE_REFRESH_MS,
    assetStateSettingsProblems,
    formatStateValue,
    isStale,
    isStatePath,
    projectedEntries,
    sanitizeAssetStateSettings,
    statePaths,
    statusColors,
    statusOf,
    statusTone,
    valueAtStatePath,
} from "./assetStatePanel";
import { HISTORY_PANEL_REFRESH_MS, TONE_COLORS } from "./historyPanels";
import { canAddPanelType, panelTitle, sanitizeWorkspaceLayout } from "./workspaceLayout";

const state = {
    status: "Warning",
    state_description: "Temperature high",
    production: { speed: 12.3456789, running: true, lots: [{ id: "L-1" }, { id: "L-2" }] },
    mode: "auto",
    alarms: {
        "n1|": { name: "Temp", level: "Warning", value: "81 °C" },
        "n2|p": { name: "Pressure (p)", level: "Alarm", value: "9 bar" },
    },
    machines: { "m1|": { name: "Line", state: "Running", since: "2026-11-20T10:00:00Z" } },
};

describe("Asset state panel", () => {
    it("reads every 5 s, as the Alarms and Approvals panels", () => {
        expect(ASSET_STATE_REFRESH_MS).toBe(5000);
        expect(HISTORY_PANEL_REFRESH_MS).toBe(5000);
    });

    it("finds values by their path, with positions of lists", () => {
        expect(valueAtStatePath(state, "production.speed")).toBe(12.3456789);
        expect(valueAtStatePath(state, "production.lots.1.id")).toBe("L-2");
        expect(valueAtStatePath(state, "production.lots.x")).toBeUndefined();
        expect(valueAtStatePath(state, "nothing.here")).toBeUndefined();
        expect(valueAtStatePath(state, "mode.length")).toBeUndefined();
        expect(valueAtStatePath(state, "constructor")).toBeUndefined();
    });

    it("writes the values", () => {
        expect(formatStateValue(undefined)).toBe("—");
        expect(formatStateValue(true)).toBe("Yes");
        expect(formatStateValue("auto")).toBe("auto");
        expect(formatStateValue(12.3456789)).toBe((12.3457).toLocaleString(undefined, { maximumFractionDigits: 4 }));
        expect(formatStateValue({ a: 1 })).toBe('{"a":1}');
    });

    it("colours the statuses of the platform and those the panel sets", () => {
        expect(statusTone("OK")).toBe("ok");
        expect(statusTone("Warning")).toBe("warning");
        expect(statusTone("Alarm")).toBe("danger");
        expect(statusTone("Running")).toBe("muted");
        expect(statusColors("Alarm")).toBe(TONE_COLORS.danger);
        expect(statusColors("Running", { Running: "#2a7" }).bg).toBe("#2a7");
        expect(statusOf({})).toBe("Unknown");
    });

    it("lists the alarms (most severe first) and machines the nodes project", () => {
        const alarms = projectedEntries(state, "alarms");
        expect(alarms.map((a) => a.name)).toEqual(["Pressure (p)", "Temp"]);
        expect(alarms[0]).toMatchObject({ level: "Alarm", value: "9 bar" });
        expect(projectedEntries(state, "machines")[0]).toMatchObject({ name: "Line", state: "Running", since: "2026-11-20T10:00:00Z" });
        expect(projectedEntries({ alarms: [1, 2] }, "alarms")).toEqual([]);
    });

    it("says when the state is old", () => {
        const now = Date.parse("2026-11-20T12:00:00Z");
        expect(isStale("2026-11-20T11:00:00Z", 30, now)).toBe(true);
        expect(isStale("2026-11-20T11:45:00Z", 30, now)).toBe(false);
        expect(isStale("2026-11-20T11:00:00Z", undefined, now)).toBe(false);
        expect(isStale(null, 30, now)).toBe(false);
    });

    it("offers the paths of the state, without those of the nodes", () => {
        expect(statePaths(state)).toEqual(["production.speed", "production.running", "production.lots.0.id", "production.lots.1.id", "mode"]);
    });

    it("checks the settings", () => {
        expect(isStatePath("a.b.0")).toBe(true);
        expect(isStatePath("a/b")).toBe(false);
        expect(isStatePath("a..b")).toBe(false);
        expect(assetStateSettingsProblems({ stateFields: [{ path: "ok.path" }], statusColors: { Running: "#0a0" }, staleMinutes: 10 })).toEqual([]);
        expect(assetStateSettingsProblems({ stateFields: [{ path: "a'b" }] })).toHaveLength(1);
        expect(assetStateSettingsProblems({ statusColors: { Running: "url(x)" } })).toHaveLength(1);
        expect(assetStateSettingsProblems({ staleMinutes: -3 })).toHaveLength(1);
        expect(
            sanitizeAssetStateSettings({
                stateFields: [{ path: "a.b", label: " Speed ", unit: "m/s" }, { path: "x/y" }],
                statusColors: { Running: "#0a0", "": "#fff", Bad: "javascript:x" },
                staleMinutes: 0,
            }),
        ).toEqual({ stateFields: [{ path: "a.b", label: "Speed", unit: "m/s" }], statusColors: { Running: "#0a0" } });
    });

    it("is a panel type of the layout, one per slide", () => {
        const panel = { id: "s", type: "assetState", x: 0, y: 0, w: 4, h: 5, stateFields: [{ path: "mode" }], staleMinutes: 15 };
        const layout = sanitizeWorkspaceLayout(
            { version: 2, slides: [{ id: "a", title: "A", tag: "Slide_1", panels: [panel, { ...panel, id: "t" }] }] },
            { hasModel: false },
        )!;
        const panels = layout.slides[0].panels;
        expect(panels).toHaveLength(1);
        expect(panels[0]).toMatchObject({ type: "assetState", stateFields: [{ path: "mode" }], staleMinutes: 15 });
        expect(panelTitle(panels[0])).toBe("Asset state");
        expect(canAddPanelType(layout.slides[0], "assetState", false)).toBe(false);
    });
});
