import { describe, expect, it } from "vitest";
import {
    ASSET_STATE_SOURCE,
    computeDataSeries,
    computeFormulaSeries,
    FORMULA_SOURCE,
    dataChartSources,
    dataChartTopics,
    dataExtent,
    holdRange,
    dataFieldPaths,
    heatmapChartOption,
    numbersAt,
    sanitizeDataChart,
    valuesAt,
    xyChartOption,
    DataChartOptions,
} from "./dataChart";
import { computeSurface, defaultSurface } from "../surface/surfacePanel";
import { assetStateMessage } from "./assetStateSource";
import { LiveMessage } from "../liveValues";

const store =
    (messages: Record<string, unknown>, at = 1000) =>
    (ref: string): LiveMessage | undefined =>
        ref in messages ? { payload: messages[ref], receivedAt: at } : undefined;

describe("Data chart settings", () => {
    it("keeps the valid settings and drops the rest", () => {
        expect(
            sanitizeDataChart({
                kind: "xy",
                series: [
                    {
                        source: "dtm2sim",
                        x: "freq",
                        y: "amplitude",
                        style: "area",
                        color: "#ff0000",
                        name: "PSD",
                        extra: 1,
                    },
                    { source: "bad topic", y: "a" },
                    { source: ASSET_STATE_SOURCE, y: "points.*.y" },
                ],
                xLabel: "Frequency (Hz)",
                yLog: true,
                xMin: 5,
                xMax: 1,
                yMin: 0.001,
                yMax: 10,
                legend: "yes",
            }),
        ).toEqual({
            kind: "xy",
            series: [
                {
                    source: "dtm2sim",
                    x: "freq",
                    y: "amplitude",
                    style: "area",
                    color: "#ff0000",
                    name: "PSD",
                },
                { source: ASSET_STATE_SOURCE, y: "points.*.y" },
            ],
            xLabel: "Frequency (Hz)",
            yLog: true,
            yMin: 0.001,
            yMax: 10,
        });
        expect(
            sanitizeDataChart({
                kind: "points3d",
                series: [{ source: "dtm2sim", x: "x", y: "y" }],
            }),
        ).toBeNull();
        expect(sanitizeDataChart({ kind: "pie" })).toBeNull();
        expect(sanitizeDataChart({ kind: "heatmap", surface: defaultSurface() })).toMatchObject({ kind: "heatmap", surface: { mode: "function" } });
    });

    it("names its sources and the topics to listen to", () => {
        const data: DataChartOptions = {
            kind: "xy",
            series: [
                { source: "dtm2sim", y: "a" },
                { source: ASSET_STATE_SOURCE, y: "b" },
                { source: "dtm2sim", y: "c" },
            ],
        };
        expect(dataChartSources(data)).toEqual(["dtm2sim", ASSET_STATE_SOURCE]);
        expect(dataChartTopics(data)).toEqual(["dtm2sim"]);
        expect(
            dataChartTopics({
                kind: "surface",
                surface: {
                    mode: "data",
                    topicRef: ASSET_STATE_SOURCE,
                    path: "grid",
                    xMin: 0,
                    xMax: 1,
                    yMin: 0,
                    yMax: 1,
                },
            }),
        ).toEqual([]);
    });
});

describe("Data chart values", () => {
    it("takes a field of every item of a list", () => {
        const payload = {
            points: [
                { x: 1, y: 2 },
                { x: 3, y: 4 },
            ],
            freq: [1, 2],
        };
        expect(valuesAt(payload, ["points", "*", "y"])).toEqual([2, 4]);
        expect(numbersAt(payload, "freq")).toEqual([1, 2]);
        expect(numbersAt(payload, "points")).toBe("points is not a list of numbers");
        expect(numbersAt(payload, "nope")).toBe("nope is not in the data");
        expect(
            dataFieldPaths({
                freq: [1, 2],
                grid: [[1], [2]],
                points: [{ x: 1, p: { q: 2 } }],
                n: 3,
                s: { t: true },
            }),
        ).toEqual(["freq", "grid", "points.*.x", "points.*.p.q", "n", "s.t"]);
    });

    it("pairs the fields of each series and says what is missing", () => {
        const get = store(
            {
                dtm2sim: {
                    freq: [10, 20, 30],
                    amplitude: [0.1, 0.4, 0.2, 9],
                    bad: "x",
                },
            },
            5000,
        );
        const result = computeDataSeries(
            {
                kind: "xy",
                series: [
                    { source: "dtm2sim", x: "freq", y: "amplitude", name: "PSD" },
                    { source: "dtm2sim", y: "freq" },
                    { source: "dtm2sim", y: "missing" },
                    { source: ASSET_STATE_SOURCE, y: "v" },
                ],
            },
            get,
        );
        if ("error" in result) throw new Error(result.error);
        expect(result.receivedAt).toBe(5000);
        expect(result.series).toEqual([
            {
                name: "PSD",
                style: "line",
                color: undefined,
                points: [
                    [10, 0.1],
                    [20, 0.4],
                    [30, 0.2],
                ],
            },
            {
                name: "freq",
                style: "line",
                color: undefined,
                points: [
                    [0, 10],
                    [1, 20],
                    [2, 30],
                ],
            },
        ]);
        expect(result.notes).toEqual([
            "PSD: fields of different lengths, 3 points drawn",
            "missing: missing is not in the data",
            "Waiting for the asset's state",
        ]);
        expect(computeDataSeries({ kind: "xy", series: [{ source: "dtm2sim", y: "a" }] }, store({}))).toEqual({ error: "Waiting for the data of dtm2sim" });
    });

    it("draws 3D points and a log axis without the values of 0 or less", () => {
        const get = store({
            [ASSET_STATE_SOURCE]: {
                pts: [
                    { x: 1, y: 2, z: 3 },
                    { x: 4, y: 5, z: "6" },
                ],
            },
        });
        const points = computeDataSeries(
            {
                kind: "points3d",
                series: [
                    {
                        source: ASSET_STATE_SOURCE,
                        x: "pts.*.x",
                        y: "pts.*.y",
                        z: "pts.*.z",
                    },
                ],
            },
            get,
        );
        expect(points).toMatchObject({
            series: [
                {
                    style: "scatter",
                    points: [
                        [1, 2, 3],
                        [4, 5, 6],
                    ],
                },
            ],
        });
        const data: DataChartOptions = {
            kind: "xy",
            yLog: true,
            series: [{ source: "t", y: "v" }],
        };
        const xy = computeDataSeries(data, store({ t: { v: [0, 1, 10] } }));
        if ("error" in xy) throw new Error(xy.error);
        const option = xyChartOption(data, xy) as any;
        expect(option.yAxis.type).toBe("log");
        expect(option.series[0].data).toEqual([
            [1, 1],
            [2, 10],
        ]);
    });

    it("draws a grid as a heat map", () => {
        const surface = {
            mode: "data" as const,
            topicRef: "dtm2sim",
            path: "g",
            xMin: 0,
            xMax: 1,
            yMin: 0,
            yMax: 1,
        };
        const grid = computeSurface(
            surface,
            store({
                dtm2sim: {
                    g: {
                        z: [
                            [1, 2],
                            [3, 4],
                        ],
                        x: [10, 20],
                        y: [5, 6],
                    },
                },
            }),
        );
        if ("error" in grid) throw new Error(grid.error);
        const option = heatmapChartOption(surface, grid.grid) as any;
        // axes in the units of x and y, the values under the mouse at the points of the grid
        expect(option.xAxis).toMatchObject({ type: "value", min: 10, max: 20 });
        expect(option.yAxis).toMatchObject({ type: "value", min: 5, max: 6 });
        expect(option.series.find((s: any) => s.name === "values").data).toEqual([
            [10, 5, 1],
            [20, 5, 2],
            [10, 6, 3],
            [20, 6, 4],
        ]);
    });

    it("draws a formula y = f(x) beside the data, with its live parameters", () => {
        const data: DataChartOptions = {
            kind: "xy",
            series: [
                { source: FORMULA_SOURCE, formula: { expression: "A*x + b", params: [{ name: "A", value: 2, topicRef: "dtm2sim", path: "gain" }, { name: "b", value: 1 }], xMin: 0, xMax: 2, points: 3 } },
                { source: "dtm2sim", y: "v" },
            ],
        };
        expect(dataChartSources(data)).toEqual(["dtm2sim"]);
        const waiting = computeDataSeries(data, store({}));
        if ("error" in waiting) throw new Error(waiting.error);
        expect(waiting.series[0]).toMatchObject({ name: "y = A*x + b", points: [[0, 1], [1, 3], [2, 5]] });
        expect(waiting.notes).toContain("y = A*x + b: waiting for the value of A, shown with its own value");
        const live = computeDataSeries(data, store({ dtm2sim: { gain: 10, v: [7] } }));
        if ("error" in live) throw new Error(live.error);
        expect(live.series.map((s) => s.points)).toEqual([[[0, 1], [1, 11], [2, 21]], [[0, 7]]]);
        expect(computeFormulaSeries({ expression: "1/x", xMin: -1, xMax: 1, points: 3 }, store({}))).toEqual({ points: [[-1, -1], [1, 1]], waiting: [] });
        expect(sanitizeDataChart({ kind: "xy", series: [{ source: FORMULA_SOURCE, formula: { expression: "x", xMin: 1, xMax: 0 } }] })).toBeNull();
        expect(sanitizeDataChart({ kind: "points3d", series: [{ source: FORMULA_SOURCE, formula: { expression: "x", xMin: 0, xMax: 1 } }] })).toBeNull();
        expect(sanitizeDataChart({ kind: "xy", series: [{ source: FORMULA_SOURCE, formula: { expression: "a*x", params: [{ name: "a", value: 1 }, { name: "pi", value: 2 }], xMin: 0, xMax: 1, points: 50 }, name: "Fit" }] })).toEqual({
            kind: "xy",
            series: [{ source: FORMULA_SOURCE, formula: { expression: "a*x", params: [{ name: "a", value: 1 }], xMin: 0, xMax: 1, points: 50 }, name: "Fit" }],
        });
    });

    it("gives the asset's state the time it was written", () => {
        expect(
            assetStateMessage({
                assetUid: "a",
                description: "",
                state: { v: 1 },
                lastUpdated: "2026-01-02T03:04:05Z",
            }),
        ).toEqual({
            payload: { v: 1 },
            receivedAt: Date.parse("2026-01-02T03:04:05Z"),
        });
        expect(assetStateMessage({ assetUid: "a", description: "", state: { v: 1 }, lastUpdated: null }, 7)).toEqual({ payload: { v: 1 }, receivedAt: 7 });
        expect(assetStateMessage(null)).toBeUndefined();
    });
});

describe("axes that keep their range", () => {
    const result = (points: [number, number][]) => ({ series: [{ name: "a", style: "line", points }], notes: [] }) as any;

    it("grows to take new data, at round values with a little room, and never shrinks", () => {
        const first = holdRange(null, dataExtent(result([[0, -20], [4, 20]]), 1));
        expect(first).toEqual({ min: -30, max: 30 });
        // smaller data: the same range (the change is seen against the same scale)
        expect(holdRange(first, dataExtent(result([[0, -5], [4, 5]]), 1))).toBe(first);
        // larger: it grows
        const grown = holdRange(first, dataExtent(result([[0, -40], [4, 30]]), 1))!;
        expect(grown.min).toBeLessThanOrEqual(-40);
        expect(grown.max).toBeGreaterThanOrEqual(30);
    });

    it("takes whole decades on a log axis, and leaves out what it cannot draw", () => {
        expect(holdRange(null, dataExtent(result([[0.5, 0], [3, 23]]), 1, true), true)).toEqual({ min: 10, max: 100 });
    });

    it("is drawn as the axis range, unless the axis has its own, and rescaling is kept by the layout", () => {
        const data = { kind: "xy", series: [{ source: "dtm2sim", x: "a", y: "b" }], yMin: 0, yMax: 6 } as any;
        const option = xyChartOption(data, result([[0, 1]]), { x: { min: -1, max: 9 }, y: { min: -50, max: 50 } }) as any;
        expect(option.xAxis).toMatchObject({ min: -1, max: 9 });
        expect(option.yAxis).toMatchObject({ min: 0, max: 6 });
        expect(sanitizeDataChart({ ...data, rescale: true })?.rescale).toBe(true);
    });
});
