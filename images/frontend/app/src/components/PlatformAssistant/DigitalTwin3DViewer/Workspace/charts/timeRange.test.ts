import { describe, expect, it } from "vitest";
import { describeRange, isLive, panelTimeRange, parseTime, resolveRange, shiftRange, spanMs, zoomOut } from "./timeRange";

const NOW = new Date(2026, 10, 9, 15, 30, 20).getTime(); // Monday 9 November 2026, 15:30:20 local

describe("time range", () => {
    it("reads Grafana's relative times and dates", () => {
        expect(parseTime("now", NOW)).toBe(NOW);
        expect(parseTime("now-6h", NOW)).toBe(NOW - 6 * 3600_000);
        expect(parseTime("now/d", NOW)).toBe(new Date(2026, 10, 9).getTime());
        expect(parseTime("now/d", NOW, true)).toBe(new Date(2026, 10, 10).getTime() - 1);
        expect(parseTime("now-1d/d", NOW)).toBe(new Date(2026, 10, 8).getTime());
        expect(parseTime("now/w", NOW)).toBe(new Date(2026, 10, 9).getTime()); // Monday
        expect(parseTime("now/M", NOW)).toBe(new Date(2026, 10, 1).getTime());
        expect(parseTime("1794240000000", NOW)).toBe(1794240000000);
        expect(parseTime("2026-11-09T10:00:00Z", NOW)).toBe(Date.parse("2026-11-09T10:00:00Z"));
        expect(parseTime("yesterday", NOW)).toBeNull();
        expect(spanMs("5m")).toBe(300_000);
        expect(spanMs("1 h")).toBeNull();
    });

    it("resolves and describes ranges", () => {
        expect(resolveRange({ from: "now-1h", to: "now" }, NOW)).toEqual({ from: NOW - 3600_000, to: NOW });
        expect(resolveRange({ from: "now", to: "now-1h" }, NOW)).toBeNull();
        expect(describeRange({ from: "now-6h", to: "now" })).toBe("Last 6 hours");
        expect(describeRange({ from: "now-2h", to: "now" })).toBe("Last 2 hours");
        expect(describeRange({ from: "now-1d/d", to: "now-1d/d" })).toBe("Yesterday");
        expect(describeRange({ from: "now-2h", to: "now-1h" })).toBe("now-2h to now-1h");
        expect(isLive({ from: "now-1h", to: "now" })).toBe(true);
        expect(isLive({ from: "2026-11-09T10:00:00Z", to: "2026-11-09T11:00:00Z" })).toBe(false);
    });

    it("zooms out and moves the range", () => {
        const r = { from: NOW - 3600_000 * 3, to: NOW - 3600_000 };
        expect(zoomOut(r, NOW)).toEqual({ from: NOW - 3600_000 * 4, to: NOW });
        expect(shiftRange(r, -1, NOW)).toEqual({ from: NOW - 3600_000 * 4, to: NOW - 3600_000 * 2 });
        expect(shiftRange(r, 1, NOW)).toEqual({ from: NOW - 3600_000 * 2, to: NOW });
    });

    it("applies the panel's relative time and time shift", () => {
        const page = { from: NOW - 3600_000, to: NOW };
        expect(panelTimeRange(page, NOW)).toEqual({ range: page, info: null });
        expect(panelTimeRange(page, NOW, "24h")).toEqual({ range: { from: NOW - 86400_000, to: NOW }, info: "Last 24 hours" });
        expect(panelTimeRange(page, NOW, undefined, "1d")).toEqual({ range: { from: page.from - 86400_000, to: NOW - 86400_000 }, info: "shifted 1d" });
    });
});
