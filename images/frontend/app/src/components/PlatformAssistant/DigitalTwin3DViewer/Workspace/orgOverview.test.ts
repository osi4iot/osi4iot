import { describe, expect, it } from "vitest";
import {
    OrgOverviewData,
    OrgOverviewGroup,
    alarmsChart,
    availabilityChart,
    availabilityTone,
    axisLabels,
    coverageText,
    formatHours,
    formatMinutes,
    formatPercent,
    orgOverviewSettingsProblems,
    orgOverviewUrl,
    formatTokens,
    pipelineCounts,
    pipelinesText,
    pipelinesTone,
    tokenUse,
    sanitizeOrgOverviewSettings,
    sortGroupsByAttention,
    statusColor,
} from "./orgOverview";
import { defaultWorkspaceLayout, panelTitle, sanitizeWorkspaceLayout } from "./workspaceLayout";

const group = (over: Partial<OrgOverviewGroup>): OrgOverviewGroup => ({
    id: 1,
    name: "G",
    assets: 4,
    assetsWithHistory: 2,
    inactiveAssets: 0,
    availability: 0.99,
    mtbfHours: 10,
    mttrHours: 1,
    failures: 1,
    alarmsRaised: 0,
    mttaMinutes: null,
    activeAlarms: 0,
    activeAlarmsByLevel: {},
    approvalsPending: 0,
    statusTime: [],
    noDataSeconds: 0,
    ai: { monthTokens: 0, monthlyTokenLimit: 0 },
    s3: { folders: 0, bytes: 0, lastStorage: null },
    pipelines: { deployed: 0, failures: 0, nodeErrors: 0, statusSubjects: [] },
    ...over,
});

describe("Organization overview", () => {
    it("formats the indicators", () => {
        expect(formatPercent(0.97412)).toBe("97.4%");
        expect(formatPercent(1)).toBe("100%");
        expect(formatPercent(null)).toBe("—");
        expect(formatHours(0.5)).toBe("30 min");
        expect(formatHours(3.42)).toBe("3.4 h");
        expect(formatHours(30)).toBe("30 h");
        expect(formatHours(72)).toBe("3.0 d");
        expect(formatMinutes(0.5)).toBe("30 s");
        expect(formatMinutes(6)).toBe("6 min");
        expect(formatMinutes(null)).toBe("—");
        expect(availabilityTone(0.985)).toBe("ok");
        expect(availabilityTone(0.96)).toBe("warning");
        expect(availabilityTone(0.9)).toBe("danger");
        expect(availabilityTone(null)).toBe("muted");
        expect(coverageText({ assets: 8, assetsWithHistory: 6, inactiveAssets: 1 })).toBe("6 of 8 assets with history · 1 with no data recorded");
        expect(coverageText({ assets: 0, assetsWithHistory: 0, inactiveAssets: 0 })).toBe("No assets");
    });

    it("puts first the groups that need attention", () => {
        const sorted = sortGroupsByAttention([
            group({ id: 1, name: "Calm", availability: 0.999 }),
            group({ id: 2, name: "Warned", activeAlarms: 1, activeAlarmsByLevel: { Warning: 1 } }),
            group({ id: 3, name: "Alarmed", activeAlarms: 1, activeAlarmsByLevel: { Alarm: 1 } }),
            group({ id: 4, name: "Low", availability: 0.9 }),
            group({ id: 5, name: "Unmeasured", availability: null }),
        ]);
        expect(sorted.map((g) => g.name)).toEqual(["Alarmed", "Warned", "Low", "Calm", "Unmeasured"]);
    });

    it("keeps valid settings only", () => {
        expect(sanitizeOrgOverviewSettings({ unavailableStatuses: ["Alarm", " Stopped ", "Alarm", 3, "bad;"], period: "90d" })).toEqual({
            unavailableStatuses: ["Alarm", "Stopped"],
            period: "90d",
        });
        expect(sanitizeOrgOverviewSettings({ period: "2y" })).toEqual({});
        expect(orgOverviewSettingsProblems({ unavailableStatuses: ["Alarm", "alarm"] })).toEqual(["A status is repeated"]);
        expect(orgOverviewSettingsProblems({ unavailableStatuses: ["a/b"] })).toHaveLength(1);
        expect(orgOverviewUrl(5, 9, "12m", ["Alarm", "Fault"])).toMatch(/organization_overview\/5\/9\?period=12m&unavailable=Alarm%2CFault$/);
    });

    it("draws the charts of the series", () => {
        const series: OrgOverviewData["series"] = [
            { start: "2026-11-01T00:00:00.000Z", availability: 0.99, alarms: { Alarm: 2, Warning: 3 } },
            { start: "2026-11-02T00:00:00.000Z", availability: null, alarms: {} },
            { start: "2026-11-03T00:00:00.000Z", availability: 0.95, alarms: { Warning: 1 } },
        ];
        const a = availabilityChart(series);
        expect(a.points).toHaveLength(2);
        // a gap where there is no value
        expect(a.path.match(/M/g)).toHaveLength(2);
        expect(a.min).toBeLessThanOrEqual(0.94);
        expect(a.points[0].y).toBeLessThan(a.points[1].y);
        const b = alarmsChart(series);
        expect(b.bars[0]).toMatchObject({ alarm: 2, other: 3 });
        expect(b.bars[2]).toMatchObject({ alarm: 0, other: 1 });
        expect(b.top).toBeGreaterThanOrEqual(5);
        expect(axisLabels(series, "day").length).toBeLessThanOrEqual(7);
        expect(statusColor("Alarm", ["Alarm"], 0)).toBe("#f2495c");
        expect(statusColor("No data recorded", [], 0)).toBe("#5a6069");
    });

    it("gives the organization overview its own layout and keeps its settings", () => {
        const layout = defaultWorkspaceLayout({ hasModel: false, hasCamera: false, organization: true });
        expect(layout.slides[0].panels.map((p) => p.type)).toEqual(["orgOverview"]);
        const clean = sanitizeWorkspaceLayout(
            {
                version: 2,
                slides: [
                    {
                        id: "s1",
                        title: "Overview",
                        tag: "Slide_1",
                        panels: [
                            { id: "o", type: "orgOverview", x: 0, y: 0, w: 12, h: 24, unavailableStatuses: ["Alarm", "Stopped"], period: "7d" },
                            { id: "o2", type: "orgOverview", x: 0, y: 24, w: 12, h: 4 },
                        ],
                    },
                ],
            },
            { hasModel: false },
        );
        const panels = clean!.slides[0].panels;
        expect(panels).toHaveLength(1);
        expect(panels[0]).toMatchObject({ unavailableStatuses: ["Alarm", "Stopped"], period: "7d" });
        expect(panelTitle(panels[0])).toBe("Organization overview");
    });
    it("counts the pipelines by the status they say, and the tokens against the limit", () => {
        const subjects = [{ digitalTwinId: 1 }, { digitalTwinId: 2 }, { digitalTwinId: 3 }, { digitalTwinId: 4 }];
        const now = 100_000;
        const seen = { 1: { status: "running", at: now - 1000 }, 2: { status: "error", at: now - 2000 }, 3: { status: "running", at: now - 60_000 } };
        const c = pipelineCounts(subjects, seen, now, 0);
        expect(c).toEqual({ running: 1, error: 1, notRunning: 2, waiting: 0, total: 4 });
        expect(pipelinesText(c)).toBe("1/4 running · 1 error");
        expect(pipelinesTone(c)).toBe("danger");
        // just opened: waiting for their first status
        const w = pipelineCounts(subjects, {}, now, now - 1000);
        expect(w.waiting).toBe(4);
        expect(pipelinesText(w)).toBe("…");
        expect(pipelinesTone(pipelineCounts([], {}, now, 0))).toBe("muted");
        expect(formatTokens(4_100_000)).toBe("4.1M");
        expect(formatTokens(12_500)).toBe("13k");
        expect(tokenUse(85, 100, 80).tone).toBe("warning");
        expect(tokenUse(100, 100, 80).tone).toBe("danger");
        expect(tokenUse(10, 0).fraction).toBeNull();
    });
});
