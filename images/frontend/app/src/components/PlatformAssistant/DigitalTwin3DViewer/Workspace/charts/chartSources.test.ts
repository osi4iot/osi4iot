import { describe, expect, it, vi } from "vitest";
import {
    bucketize,
    chartLiveTopics,
    combineFetchSeries,
    createLiveSeriesBuffer,
    liveBucketSeconds,
    numericStatePaths,
    numericValues,
    recordingStore,
} from "./chartSources";
import { createLiveValueStore } from "../liveValues";
import { TimeSeriesResponse, resolveSeries, sourceSeriesOptions } from "../chartSeries";
import { WorkspaceLayout, showsSimulation } from "../workspaceLayout";

describe("live series of the Time series charts", () => {
    it("keeps the numbers of the messages, of a slide and of none", () => {
        const buffer = createLiveSeriesBuffer(60_000, 3);
        const store = recordingStore(createLiveValueStore(), buffer);
        store.publish("dtm2sim", { load: 1, vib: [0.1, 0.2], ok: true, name: "x", t: "2.5" }, 1000);
        store.publish("dtm2sim", { load: 2, $slide: "s1" }, 2000);
        store.publish("dtm2sim", { load: 3, $slide: "s2" }, 3000);
        expect(store.get("dtm2sim")?.payload).toMatchObject({ load: 1 });
        expect(buffer.fields("dtm2sim")).toEqual(["load", "ok", "t", "vib.0", "vib.1"]);
        expect(buffer.values("dtm2sim", "load", "s1", 0, 10_000)).toEqual([
            [1000, 1],
            [2000, 2],
        ]);
        expect(buffer.values("dtm2sim", "vib.1", null, 0, 10_000)).toEqual([[1000, 0.2]]);
        // at most 3 samples, and none older than a minute
        store.publish("dtm2sim", { load: 4 }, 4000);
        expect(buffer.values("dtm2sim", "load", "s2", 0, 10_000).map(([t]) => t)).toEqual([3000, 4000]);
        store.publish("dtm2sim", { load: 5 }, 70_000);
        expect(buffer.values("dtm2sim", "load", null, 0, 100_000)).toEqual([[70_000, 5]]);
        expect(numericValues({ a: { b: "1e3" }, c: null, d: "no" })).toEqual({ "a.b": 1000 });
        expect(numericStatePaths({ status: "OK", kpi: { oee: 0.8 } })).toEqual(["kpi.oee"]);
    });

    it("summarizes the values in intervals as admin_api", () => {
        expect(liveBucketSeconds(0, 600_000, 300)).toBe(2);
        expect(liveBucketSeconds(0, 600_000, 300, "1m")).toBe(60);
        expect(
            bucketize(
                [
                    [1000, 1],
                    [1500, 3],
                    [2500, 10],
                ],
                1,
            ),
        ).toEqual([
            [1000, 2, 1, 3, 2, 4, 3, 1],
            [2000, 10, 10, 10, 1, 10, 10, 10],
        ]);
        expect(bucketize([[1000, 1]], 1, true)).toEqual([[1000, 1, 1, 1, 1, 1, 1, 1]]);
    });

    it("answers the sensors, the asset state and the live series as one", async () => {
        const buffer = createLiveSeriesBuffer();
        buffer.record("dtm2sim", { load: 4 }, 10_500);
        buffer.record("dtm2sim", { load: 6 }, 10_700);
        const server = vi.fn(async (query: any): Promise<TimeSeriesResponse> => ({
            from: "a",
            to: "b",
            bucketSeconds: 1,
            series: query.series.map((s: any) => ({ ...s, label: s.field, units: "-", sensor: "x", points: [[10_000, 1, 1, 1, 1, 1, 1, 1]] })),
        }));
        const fetch = combineFetchSeries(server, { assetId: 7, buffer, slideId: () => "s1" });
        const result = await fetch(
            {
                groupId: 1,
                from: 0,
                to: 20_000,
                points: 100,
                series: [
                    { sensorId: 0, field: "load", sensor: "@live:dtm2sim" },
                    { sensorId: 3, field: "temp" },
                    { sensorId: 0, field: "kpi.oee", sensor: "@assetState" },
                ],
            },
            new AbortController().signal,
        );
        expect(server.mock.calls[0][0].series).toEqual([
            { sensorId: 3, field: "temp" },
            { sensorId: 0, assetId: 7, field: "kpi.oee" },
        ]);
        expect(result.series.map((s) => s.field)).toEqual(["load", "temp", "kpi.oee"]);
        expect(result.series[0]).toMatchObject({ live: true, sensor: "Live · dtm2sim", points: [[10_000, 5, 4, 6, 2, 10, 6, 4]] });
        // only live series: admin_api is not asked; a histogram of their own
        server.mockClear();
        const bins = await fetch(
            { groupId: 1, from: 0, to: 20_000, points: 100, histogram: { bins: 2 }, series: [{ sensorId: 0, field: "load", sensor: "@live:dtm2sim" }] },
            new AbortController().signal,
        );
        expect(server).not.toHaveBeenCalled();
        expect(bins.histogram).toEqual({ min: 4, max: 6, size: 1, offset: 0 });
        expect(bins.series[0].bins).toEqual([
            [4, 1],
            [6, 1],
        ]);
        // a twin without an asset: no history
        const noAsset = await combineFetchSeries(server, { slideId: () => null })(
            { groupId: 1, from: 0, to: 1, points: 10, series: [{ sensorId: 0, field: "kpi.oee", sensor: "@assetState" }] },
            new AbortController().signal,
        );
        expect(noAsset.series[0]).toMatchObject({ historyOff: true, points: [] });
    });

    it("offers and resolves the series of the asset state and of the topics", () => {
        const options = sourceSeriesOptions(["kpi.oee"], [{ topic: "dtm2sim", fields: ["vib.1"] }]);
        expect(options.map((o) => [o.key, o.sensorDescription, o.label])).toEqual([
            ["@assetState|kpi.oee|", "Asset state", "kpi.oee"],
            ["@live:dtm2sim|vib.1|", "Live dtm2sim", "vib[1]"],
        ]);
        // a saved series of a source is never "missing", even before its fields are seen
        const { found, missing } = resolveSeries(
            [
                { sensor: "@live:dev2sim", field: "x" },
                { sensor: "gone", field: "y" },
            ],
            [],
        );
        expect(found.map((o) => o.key)).toEqual(["@live:dev2sim|x|"]);
        expect(missing).toHaveLength(1);
        const layout: WorkspaceLayout = {
            version: 2,
            slides: [
                {
                    id: "a",
                    title: "A",
                    tag: "A",
                    panels: [
                        {
                            id: "c",
                            type: "chart",
                            x: 0,
                            y: 0,
                            w: 4,
                            h: 4,
                            series: [
                                { sensor: "@live:dtm2sim", field: "load" },
                                { sensor: "@assetState", field: "v" },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(chartLiveTopics(layout)).toEqual(["dtm2sim"]);
        expect(showsSimulation(layout.slides[0].panels[0])).toBe(true);
    });
});
