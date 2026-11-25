import { describe, expect, it } from "vitest";
import { SurfaceGrid, computeFunctionSurface } from "../surface/surfacePanel";
import { contourLevels, contourLines, contours, fractionalIndex, heatmapPixels } from "./heatmapPicture";
import { heatmapChartOption } from "./dataChart";

const gridOf = (f: (x: number, y: number) => number, n: number, min = -1, max = 1): SurfaceGrid => {
    const xs = Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));
    const data: [number, number, number][] = [];
    for (const y of xs) for (const x of xs) data.push([x, y, f(x, y)]);
    const z = data.map((d) => d[2]);
    return { data, rows: n, columns: n, zMin: Math.min(...z), zMax: Math.max(...z), xs, ys: xs };
};

describe("heat map picture", () => {
    it("finds where a value falls on an axis, growing or decreasing", () => {
        expect(fractionalIndex([0, 1, 3], 2)).toBeCloseTo(1.5);
        expect(fractionalIndex([3, 1, 0], 2)).toBeCloseTo(0.5);
        expect(fractionalIndex([0, 1], 2)).toBeNaN();
    });

    it("picks round levels inside the range", () => {
        expect(contourLevels(0, 10, 5)).toEqual([2, 4, 6, 8]);
        expect(contourLevels(-0.3, 0.3, 3)).toEqual([-0.2, 0, 0.2]);
        expect(contourLevels(1, 1, 5)).toEqual([]);
    });

    it("draws a circle as one closed line, at its radius", () => {
        const grid = gridOf((x, y) => x * x + y * y, 41);
        const lines = contourLines(grid, 0.25);
        expect(lines).toHaveLength(1);
        const [line] = lines;
        expect(line[0][0]).toBeCloseTo(line[line.length - 1][0]);
        expect(line[0][1]).toBeCloseTo(line[line.length - 1][1]);
        for (const [x, y] of line) expect(Math.hypot(x, y)).toBeCloseTo(0.5, 1);
    });

    it("writes one value on each level's line", () => {
        const grid = gridOf((x, y) => x * x + y * y, 41);
        const drawn = contours(grid, [0.25, 0.5]);
        expect(drawn.lines.map((l) => l.level)).toEqual([0.25, 0.5]);
        expect(drawn.labels.map((l) => l.level)).toEqual([0.25, 0.5]);
        for (const l of drawn.labels) expect(Math.hypot(...l.at) ** 2).toBeCloseTo(l.level, 1);
    });

    it("leaves what is above a cut transparent, and the bowl coloured", () => {
        const surface = { mode: "function" as const, expression: "x^2 + y^2", params: [], xMin: -1, xMax: 1, yMin: -1, yMax: 1, steps: 21, clipAbove: 0.5 };
        const result = computeFunctionSurface(surface, () => undefined);
        if ("error" in result) throw new Error(result.error);
        expect(result.grid.cap).toBe(0.5);
        expect(result.grid.zs?.[0]).toBe(2);
        const picture = heatmapPixels(result.grid, ["#000000", "#ffffff"], 0, 0.5)!;
        const alpha = (i: number, j: number) => picture.pixels[(j * picture.width + i) * 4 + 3];
        expect(alpha(0, 0)).toBe(0);
        expect(alpha(picture.width >> 1, picture.height >> 1)).toBe(255);
        // contour lines only below the cut
        const option = heatmapChartOption(surface, result.grid) as any;
        const labels = option.series.find((s: any) => s.name === "contour values").data.map((d: number[]) => d[2]);
        expect(labels.length).toBeGreaterThan(2);
        expect(Math.max(...labels)).toBeLessThan(0.5);
    });

    it("draws no contour lines when they are off", () => {
        const grid = gridOf((x, y) => x + y, 11);
        const option = heatmapChartOption({ mode: "data", xMin: -1, xMax: 1, yMin: -1, yMax: 1, contours: false }, grid) as any;
        expect(option.series.find((s: any) => s.name === "contours").data).toEqual([]);
    });
});
