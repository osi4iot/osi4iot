import { describe, expect, it } from "vitest";
import {
    addLogEvent,
    devicesAlive,
    formatBytes,
    isDataStale,
    logEventOf,
    MAX_LOG_EVENTS,
    passesLevel,
    groupStatePaths,
    serverLevelsOf,
    keptLogEvents,
    mergeLogEvents,
    controlRoomLogsUrl,
    pipelineStatusText,
    scopeOfDigitalTwin,
    sortByAttention,
} from "./controlRoom";
import { nowUrl, eventsUrl } from "./historyPanelsApi";
import { canAddPanelType, defaultWorkspaceLayout, sanitizeWorkspaceLayout } from "./workspaceLayout";

describe("Control room", () => {
    it("knows the scope of a digital twin by its asset", () => {
        const assets = [
            { id: 1, context: "asset" },
            { id: 2, context: "group" },
            { id: 3, context: "organization" },
        ];
        expect(scopeOfDigitalTwin({ assetId: 2 }, assets)).toBe("group");
        expect(scopeOfDigitalTwin({ assetId: 3 }, assets)).toBe("organization");
        expect(scopeOfDigitalTwin({ assetId: 1 }, assets)).toBe("asset");
        expect(scopeOfDigitalTwin({ assetId: 9 }, assets)).toBe("asset");
        expect(scopeOfDigitalTwin(null, assets)).toBe("asset");
    });

    it("puts first what needs attention", () => {
        const a = (description: string, status: string) => ({ description, state: { status } });
        expect(sortByAttention([a("B", "OK"), a("A", "OK"), a("C", "Warning"), a("D", "Alarm")]).map((x) => x.description)).toEqual(["D", "C", "A", "B"]);
    });

    it("says how each pipeline is", () => {
        const now = 100_000;
        expect(pipelineStatusText({ hasPipeline: false }, undefined, now, 0).text).toBe("No pipeline");
        expect(pipelineStatusText({ hasPipeline: true }, { status: "running", at: now - 2000 }, now, 0)).toEqual({ text: "running", tone: "ok" });
        expect(pipelineStatusText({ hasPipeline: true }, { status: "error", at: now - 2000 }, now, 0).tone).toBe("danger");
        expect(pipelineStatusText({ hasPipeline: true }, { status: "running", at: now - 60_000 }, now, 0).text).toBe("No answer");
        expect(pipelineStatusText({ hasPipeline: true }, undefined, now, now - 1000).text).toBe("…");
        expect(pipelineStatusText({ hasPipeline: true }, undefined, now, 0).text).toBe("No answer");
    });

    it("says how fresh the data is", () => {
        const now = Date.parse("2026-11-21T12:00:00Z");
        expect(isDataStale("2026-11-21T11:30:00Z", now)).toBe(false);
        expect(isDataStale("2026-11-21T10:00:00Z", now)).toBe(true);
        expect(isDataStale(null, now)).toBe(true);
        const devices = [
            { topicRef: "dev2pdb_1", topicType: "dev2pdb", lastMessage: "2026-11-21T11:59:00Z" },
            { topicRef: "dev2pdb_2", topicType: "dev2pdb", lastMessage: "2026-11-20T11:59:00Z" },
            { topicRef: "dev2dtm_1", topicType: "dev2dtm", lastMessage: null },
        ];
        expect(devicesAlive(devices, now)).toBe(1);
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    });

    it("keeps the pipeline logs, newest first", () => {
        const twin = { id: 7, description: "Pump twin" };
        const e1 = logEventOf({ level: "error", name: "Agent", message: "No GPU" }, twin, "Pump", 1, 10)!;
        expect(e1).toMatchObject({ level: "error", name: "Agent", message: "No GPU", digitalTwin: "Pump twin", asset: "Pump" });
        expect(logEventOf("text", twin, "Pump", 2, 11)).toBeNull();
        expect(logEventOf({}, twin, "Pump", 2, 11)).toBeNull();
        let list = [e1];
        for (let i = 0; i < MAX_LOG_EVENTS + 5; i++) list = addLogEvent(list, { ...e1, id: i + 2 });
        expect(list).toHaveLength(MAX_LOG_EVENTS);
        expect(list[0].id).toBe(MAX_LOG_EVENTS + 6);
        expect(passesLevel({ level: "info", component: "node" }, "important")).toBe(false);
        expect(passesLevel({ level: "warning", component: "node" }, "important")).toBe(true);
        expect(passesLevel({ level: "warn", component: "node" }, "important")).toBe(true);
        // the events of the pipeline itself (started, stopped…) are important whatever their level
        expect(passesLevel({ level: "info", component: "pipeline" }, "important")).toBe(true);
        expect(passesLevel({ level: "info", component: "pipeline" }, "error")).toBe(false);
        expect(passesLevel({ level: "warning", component: "node" }, "error")).toBe(false);
        expect(passesLevel({ level: "error", component: "node" }, "error")).toBe(true);
        expect(passesLevel({ level: "debug", component: "node" }, "all")).toBe(true);
        expect(serverLevelsOf("important")).toBe("important");
        expect(serverLevelsOf("error")).toBe("important");
        expect(serverLevelsOf("all")).toBe("all");
        expect(e1.component).toBe("");
        expect(logEventOf({ level: "info", component: "pipeline", message: "Started" }, twin, "Pump", 3, 12)!.component).toBe("pipeline");
    });

    it("reads the kept logs and merges them with the live ones", () => {
        const kept = keptLogEvents([
            { at: "2026-11-20T10:00:00.000Z", level: "warning", component: "node", name: "Fn", message: "slow", digitalTwinId: 7, digitalTwin: "Pump twin", asset: "Pump" },
            { at: "not a date", level: "error", message: "lost" },
            null,
            { at: "2026-11-20T09:00:00.000Z", message: "x".repeat(800) },
        ]);
        expect(kept).toHaveLength(2);
        expect(kept[0]).toMatchObject({ level: "warning", component: "node", digitalTwinId: 7, digitalTwin: "Pump twin" });
        expect(kept[0].id).toBeLessThan(0);
        expect(kept[1].level).toBe("info");
        expect(kept[1].message.length).toBe(500);
        expect(keptLogEvents("nope")).toEqual([]);
        const live = { ...kept[0], id: 1, at: Date.parse("2026-11-21T10:00:00Z"), message: "now" };
        const merged = mergeLogEvents([live], kept);
        expect(merged.map((e) => e.message)).toEqual(["now", "slow", "x".repeat(499) + "…"]);
        expect(controlRoomLogsUrl(3, 9, "all")).toMatch(/\/admin_api\/control_room_logs\/3\/9\?levels=all$/);
    });

    it("asks the alarms and approvals of the whole group", () => {
        expect(nowUrl("alarms", 3, 0)).toMatch(/alarm_history_active\/3$/);
        expect(nowUrl("alarms", 3, 7)).toMatch(/alarm_history_active\/3\?digitalTwinId=7$/);
        expect(eventsUrl("approvals", 3, 0, 50)).toMatch(/approval_history\/3\?limit=50$/);
        expect(eventsUrl("approvals", 3, 7, 50)).toMatch(/approval_history\/3\?digitalTwinId=7&limit=50$/);
    });

    it("has its own automatic layout and panels, one of each per slide", () => {
        const layout = defaultWorkspaceLayout({ hasModel: false, hasCamera: false, controlRoom: true });
        expect(layout.slides.map((s) => s.panels.map((p) => p.type))).toEqual([["assetState", "health", "alarms", "approvals"], ["pipelineLogs"]]);
        expect(canAddPanelType(layout.slides[0], "health", false)).toBe(false);
        const twice = sanitizeWorkspaceLayout(
            { version: 2, slides: [{ id: "a", title: "A", tag: "Slide_1", panels: [{ id: "h1", type: "health", x: 0, y: 0, w: 4, h: 4 }, { id: "h2", type: "health", x: 4, y: 0, w: 4, h: 4 }] }] },
            { hasModel: false },
        )!;
        expect(twice.slides[0].panels).toHaveLength(1);
    });
    it("offers the paths of the states of all the group's assets, the most common first", () => {
        const paths = groupStatePaths([
            { state: { status: "OK", mode: "auto", pressure: { value: 3 } } },
            { state: { status: "Alarm", mode: "manual", speed: 10, alarms: { a: { name: "x" } } } },
            { state: {} },
        ]);
        expect(paths[0]).toBe("mode");
        expect(paths).toEqual(expect.arrayContaining(["pressure.value", "speed"]));
        // the fixed fields are not offered (the table shows them already)
        expect(paths).not.toContain("status");
        expect(paths.some((p) => p.startsWith("alarms"))).toBe(false);
        expect(groupStatePaths([])).toEqual([]);
    });
});
