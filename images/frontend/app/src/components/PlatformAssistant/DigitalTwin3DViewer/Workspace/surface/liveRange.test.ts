// The ranges of the axes of a formula from a message (range: {topicRef, path} -> {xMin, xMax, yMin, yMax})
import { describe, expect, it } from "vitest";
import { LiveMessage } from "../liveValues";
import { computeFunctionSurface, liveRangeOf, sanitizeSurface, surfaceTopics } from "./surfacePanel";
import { computeFormulaSeries, dataChartTopics, sanitizeDataChart } from "../dataChart/dataChart";

const message = (payload: unknown): LiveMessage => ({ payload, receivedAt: 1, last: payload }) as unknown as LiveMessage;
const from = (payload: unknown) => (topicRef: string) => (topicRef === "dtm2sim" ? message(payload) : undefined);

describe("ranges from a message", () => {
    const surface = sanitizeSurface({
        mode: "function",
        expression: "x^2 + y^2",
        xMin: 0,
        xMax: 1,
        yMin: 0,
        yMax: 1,
        steps: 5,
        range: { topicRef: "dtm2sim", path: "window" },
    })!;

    it("are kept and followed", () => {
        expect(surface.range).toEqual({ topicRef: "dtm2sim", path: "window" });
        expect(surfaceTopics(surface)).toEqual(["dtm2sim"]);
        expect(sanitizeSurface({ ...surface, range: { topicRef: "bad topic!", path: "w" } })?.range).toBeUndefined();
    });

    it("draw the surface over them; its own until a valid one arrives", () => {
        const xsOf = (get: (t: string) => LiveMessage | undefined) => {
            const r = computeFunctionSurface(surface, get);
            if (!("grid" in r) || !r.grid) throw new Error("no grid");
            const xs = r.grid.data.map((d) => d[0]);
            const ys = r.grid.data.map((d) => d[1]);
            return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        };
        expect(xsOf(from({ window: { xMin: -2, xMax: 2, yMin: 10, yMax: 20 } }))).toEqual([-2, 2, 10, 20]);
        expect(xsOf(() => undefined)).toEqual([0, 1, 0, 1]);
        expect(xsOf(from({ window: { xMin: 2, xMax: -2, yMin: 10, yMax: 20 } }))).toEqual([0, 1, 0, 1]);
        expect(liveRangeOf(surface.range, from({ window: { xMin: 1, xMax: 2 } }), true)).toBeNull();
        expect(liveRangeOf(surface.range, from({ window: { xMin: 1, xMax: 2 } }), false)).toEqual({ xMin: 1, xMax: 2 });
    });

    it("of a formula series too", () => {
        const data = sanitizeDataChart({
            kind: "xy",
            series: [{ source: "@formula", formula: { expression: "x", xMin: 0, xMax: 1, points: 3, range: { topicRef: "dtm2sim", path: "w" } } }],
        })!;
        expect(dataChartTopics(data)).toEqual(["dtm2sim"]);
        const drawn = computeFormulaSeries(data.series![0].formula!, from({ w: { xMin: -4, xMax: 4 } }));
        expect("points" in drawn && drawn.points).toEqual([
            [-4, -4],
            [0, 0],
            [4, 4],
        ]);
    });
});

describe("a surface cut at a height", () => {
    it("has no points above it, and its edge on it", () => {
        const surface = sanitizeSurface({
            mode: "function",
            expression: "x^2 + y^2",
            params: [{ name: "cap", value: 1 }],
            clipAbove: "cap",
            xMin: -2,
            xMax: 2,
            yMin: -2,
            yMax: 2,
            steps: 41,
        })!;
        expect(surface.clipAbove).toBe("cap");
        expect(sanitizeSurface({ ...surface, clipAbove: "nope" })?.clipAbove).toBeUndefined();
        const r = computeFunctionSurface(surface, () => undefined);
        if (!("grid" in r)) throw new Error(r.error);
        const drawn = r.grid.data.filter((d) => Number.isFinite(d[2]));
        expect(Math.max(...drawn.map((d) => d[2]))).toBeCloseTo(1, 9);
        // the edge: on the circle x² + y² = 1 (linearly between the points of the grid)
        for (const [x, y, z] of drawn) if (z === 1) expect(Math.abs(Math.hypot(x, y) - 1)).toBeLessThan(0.02);
        expect(r.grid.xs?.[0]).toBe(-2);
        expect(r.grid.data.some((d) => Number.isNaN(d[2]))).toBe(true);
    });
});
