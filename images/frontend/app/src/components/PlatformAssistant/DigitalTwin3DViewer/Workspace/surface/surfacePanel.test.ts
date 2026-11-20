import { describe, expect, it } from "vitest";
import { LiveMessage } from "../liveValues";
import { sanitizeWorkspaceLayout } from "../workspaceLayout";
import {
    niceRange,
    roundForAxis,
    SurfaceOptions,
    computeDataSurface,
    computeFunctionSurface,
    defaultSurface,
    sanitizeSurface,
    surfaceChartOption,
    surfaceTopics,
} from "./surfacePanel";

const messages = (byTopic: Record<string, unknown>) => (topicRef: string): LiveMessage | undefined =>
    topicRef in byTopic ? { payload: byTopic[topicRef], receivedAt: 0 } : undefined;

const fn = (over: Partial<SurfaceOptions>): SurfaceOptions => ({ ...defaultSurface(), ...over });

describe("3D Surface panels", () => {
    it("keeps the valid settings of a saved panel, and drops the rest", () => {
        expect(sanitizeSurface({ mode: "function", xMin: 1, xMax: 0, yMin: 0, yMax: 1 })).toBeNull();
        expect(sanitizeSurface({ mode: "bars", xMin: 0, xMax: 1, yMin: 0, yMax: 1 })).toBeNull();
        const surface = sanitizeSurface({
            mode: "function",
            expression: "A*x",
            params: [
                { name: "A", value: 2, topicRef: "dev2pdb_1", path: "load" },
                { name: "A", value: 3 },
                { name: "sin", value: 1 },
                { name: "B", value: "7" },
                { name: "C", value: 1, topicRef: "bad topic!", path: "v" },
            ],
            xMin: 0,
            xMax: 1,
            yMin: 0,
            yMax: 1,
            steps: 1000,
            zMin: 5,
            zMax: 1,
            xLabel: "  Length (m) ",
            colors: "rainbow",
            opacity: 0.5,
            onclick: "alert(1)",
        });
        expect(surface).toEqual({
            mode: "function",
            expression: "A*x",
            params: [
                { name: "A", value: 2, topicRef: "dev2pdb_1", path: "load" },
                { name: "C", value: 1 },
            ],
            xMin: 0,
            xMax: 1,
            yMin: 0,
            yMax: 1,
            xLabel: "Length (m)",
            opacity: 0.5,
        });
        expect(surfaceTopics(surface!)).toEqual(["dev2pdb_1"]);
    });

    it("is a panel type of the layout", () => {
        const layout = sanitizeWorkspaceLayout(
            {
                version: 2,
                slides: [{ id: "s", title: "S", tag: "S", panels: [{ id: "p", type: "surface", x: 0, y: 0, w: 6, h: 6, surface: defaultSurface() }, { id: "q", type: "surface", x: 6, y: 0, w: 6, h: 6 }] }],
            },
            { hasModel: false },
        );
        expect(layout!.slides[0].panels.map((p) => p.id)).toEqual(["p"]);
        expect(layout!.slides[0].panels[0].surface?.expression).toBe("A*sin(k*x)*cos(k*y)");
    });

    it("draws a formula over its grid, with the parameters' values as they arrive", () => {
        const surface = fn({ expression: "A*x + y", params: [{ name: "A", value: 1, topicRef: "dtm2sim", path: "gain" }], xMin: 0, xMax: 2, yMin: 0, yMax: 1, steps: 3 });
        const waiting = computeFunctionSurface(surface, messages({}));
        if ("error" in waiting) throw new Error(waiting.error);
        expect(waiting.note).toBe("Waiting for the value of A: shown with its own value");
        expect(waiting.grid.rows).toBe(3);
        expect(waiting.grid.columns).toBe(3);
        expect(waiting.grid.data.slice(0, 3)).toEqual([
            [0, 0, 0],
            [1, 0, 1],
            [2, 0, 2],
        ]);
        const live = computeFunctionSurface(surface, messages({ dtm2sim: { gain: 10 } }));
        if ("error" in live) throw new Error(live.error);
        expect(live.note).toBeUndefined();
        expect(live.grid.data[8]).toEqual([2, 1, 21]);
        expect([live.grid.zMin, live.grid.zMax]).toEqual([0, 21]);
        expect(computeFunctionSurface(fn({ expression: "x +", params: [] }), messages({}))).toEqual({ error: "The formula ends too soon" });
    });

    it("draws the grid a message carries", () => {
        const surface: SurfaceOptions = { mode: "data", topicRef: "dtm2sim", path: "fem.grid", xMin: 0, xMax: 10, yMin: 0, yMax: 1 };
        expect(computeDataSurface(surface, messages({}))).toEqual({ error: "Waiting for a message of dtm2sim" });
        const plain = computeDataSurface(surface, messages({ dtm2sim: { fem: { grid: [[1, 2, 3], [4, "x", 6]] } } }));
        if ("error" in plain) throw new Error(plain.error);
        expect(plain.grid.data).toEqual([
            [0, 0, 1],
            [5, 0, 2],
            [10, 0, 3],
            [0, 1, 4],
            [5, 1, NaN],
            [10, 1, 6],
        ]);
        const withAxes = computeDataSurface(surface, messages({ dtm2sim: { fem: { grid: { z: [[1, 2], [3, 4]], x: [100, 200], y: [7, 9] } } } }));
        if ("error" in withAxes) throw new Error(withAxes.error);
        expect(withAxes.grid.data[3]).toEqual([200, 9, 4]);
        const badAxis = computeDataSurface(surface, messages({ dtm2sim: { fem: { grid: { z: [[1, 2], [3, 4]], x: [1] } } } }));
        if ("error" in badAxis) throw new Error(badAxis.error);
        expect(badAxis.note).toMatch(/its x is not a list of 2 numbers/);
        expect(computeDataSurface(surface, messages({ dtm2sim: { fem: { grid: 5 } } }))).toMatchObject({ error: expect.stringContaining("is not a grid") });
        const big = Array.from({ length: 201 }, () => [1, 2]);
        expect(computeDataSurface(surface, messages({ dtm2sim: { fem: { grid: big } } }))).toMatchObject({ error: expect.stringContaining("at most 200") });
    });

    it("names its axes as the panel says, with a fixed range of z when it has one", () => {
        const surface = fn({ xLabel: "Span (m)", yLabel: "Width (m)", zLabel: "Deflection (mm)", zMin: -5, zMax: 5, wireframe: false });
        const result = computeFunctionSurface(surface, messages({}));
        if ("error" in result) throw new Error(result.error);
        const option = surfaceChartOption(surface, result.grid) as any;
        expect(option.xAxis3D.name).toBe("Span (m)");
        expect(option.yAxis3D.name).toBe("Width (m)");
        expect(option.zAxis3D).toMatchObject({ name: "Deflection (mm)", min: -5, max: 5 });
        expect(option.series[0]).toMatchObject({ type: "surface", dataShape: [40, 40], wireframe: { show: false } });
        // the three planes of the box are marked
        for (const key of ["xAxis3D", "yAxis3D", "zAxis3D"]) {
            expect(option[key].splitLine.show).toBe(true);
            expect(option[key].splitArea.show).toBe(true);
        }
        expect(option.tooltip.formatter({ value: [1, 2, 3.14159] })).toBe("Span (m): 1<br/>Width (m): 2<br/>Deflection (mm): 3.142");
    });

    it("rounds the numbers of the axes and the ends of an automatic range of z", () => {
        expect(roundForAxis(0.5805486440658569)).toBe(0.5805);
        expect(roundForAxis(0.1 + 0.2)).toBe(0.3);
        expect(roundForAxis(-3.14)).toBe(-3.14);
        expect(roundForAxis(123456.7)).toBe(123500);
        expect(niceRange(-0.973, 0.5805486440658569)).toEqual({ min: -1, max: 1, step: 0.5 });
        expect(niceRange(0, 21)).toEqual({ min: 0, max: 25, step: 5 });
        expect(niceRange(0.0012, 0.0047)).toEqual({ min: 0.001, max: 0.005, step: 0.001 });
        const surface = fn({ expression: "0.58*x", params: [], xMin: 0, xMax: 1, yMin: 0, yMax: 1, steps: 5 });
        const result = computeFunctionSurface(surface, messages({}));
        if ("error" in result) throw new Error(result.error);
        const option = surfaceChartOption(surface, result.grid) as any;
        expect(option.zAxis3D).toMatchObject({ min: 0, max: 0.6, interval: 0.1 });
        expect(option.visualMap).toMatchObject({ min: 0, max: 0.6 });
        expect(option.xAxis3D.axisLabel.formatter(0.30000000000000004)).toBe("0.3");
        // a fixed range of z is kept as it is
        const fixed = surfaceChartOption({ ...surface, zMin: -0.123, zMax: 1 }, result.grid) as any;
        expect(fixed.zAxis3D.min).toBe(-0.123);
        expect(fixed.zAxis3D.interval).toBeUndefined();
    });
});
