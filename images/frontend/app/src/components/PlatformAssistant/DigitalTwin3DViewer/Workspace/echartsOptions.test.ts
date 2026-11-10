import { describe, expect, it } from "vitest";
import { chartSettingsOf, drawSeries, setPath } from "./chartConfig";
import { barchartOption, gaugeOption, gaugeRange, timeseriesOption, withGaps } from "./echartsOptions";

const buckets = [
    [0, 10, 5, 15, 2, 20, 15, 5],
    [10_000, 20, 18, 22, 4, 80, 22, 18],
    [100_000, 30, 30, 30, 1, 30, 30, 30],
] as any;
const settings = (path?: string, value?: unknown) => {
    const s = chartSettingsOf({ id: "c", type: "chart", x: 0, y: 0, w: 1, h: 1 } as any);
    return path ? setPath(s, path, value) : s;
};
const series = (s = settings()) =>
    drawSeries(
        [
            { ref: { sensor: "a", field: "x" }, label: "X", sensorDescription: "A", units: "m/s^2", buckets },
            { ref: { sensor: "a", field: "y", axis: "right" }, label: "Y", sensorDescription: "A", units: "kN", buckets },
        ],
        s,
    );

describe("echarts options", () => {
    it("breaks lines at gaps unless nulls are connected", () => {
        expect(withGaps([[0, 1], [10_000, 2], [100_000, 3]], 10, false)).toEqual([[0, 1], [10_000, 2], [20_000, null], [100_000, 3]]);
        expect(withGaps([[0, 1], [10_000, null], [100_000, 3]], 10, true)).toEqual([[0, 1], [100_000, 3]]);
    });

    it("draws time series with Grafana's graph styles", () => {
        let s = settings("fieldConfig.defaults.custom.fillOpacity", 30);
        s = setPath(s, "fieldConfig.defaults.custom.lineInterpolation", "stepAfter");
        s = setPath(s, "fieldConfig.defaults.custom.thresholdsStyle.mode", "line+area");
        s = setPath(s, "fieldConfig.defaults.thresholds.steps", [{ value: null, color: "green" }, { value: 20, color: "red" }]);
        const o: any = timeseriesOption({ series: series(s), settings: s, from: 0, to: 120_000, bucketSeconds: 10 });
        expect(o.series).toHaveLength(2);
        expect(o.series[0]).toMatchObject({ type: "line", step: "end", yAxisIndex: 0 });
        expect(o.series[0].areaStyle.color).toBe("rgba(115, 191, 105, 0.3)");
        expect(o.series[1].yAxisIndex).toBe(1);
        expect(o.yAxis).toHaveLength(2);
        expect(o.series[0].markLine.data[0].yAxis).toBe(20);
        expect(o.series[0].markArea.data).toHaveLength(2);
        const bars: any = timeseriesOption({ series: series(settings("fieldConfig.defaults.custom.drawStyle", "bars")), settings: settings("fieldConfig.defaults.custom.drawStyle", "bars"), from: 0, to: 1, bucketSeconds: 10 });
        expect(bars.series[0].type).toBe("bar");
        const hidden: any = timeseriesOption({ series: series(), settings: settings(), from: 0, to: 1, bucketSeconds: 10, hidden: new Set(["a|x|"]) });
        expect(hidden.series.map((x: any) => x.name)).toEqual(["Y"]);
        const noTooltip: any = timeseriesOption({ series: series(), settings: settings("options.tooltip.mode", "none"), from: 0, to: 1, bucketSeconds: 10 });
        expect(noTooltip.tooltip.show).toBe(false);
    });

    it("draws bar charts by interval, stacked or horizontal", () => {
        let s = settings();
        s = { ...s, viz: "barchart", options: { ...s.options, orientation: "horizontal", stacking: "normal", showValue: "always" } };
        const o: any = barchartOption({ series: series(s), settings: s, from: 0, to: 1, bucketSeconds: 10 });
        expect(o.yAxis.type).toBe("category");
        expect(o.yAxis.data).toHaveLength(3);
        expect(o.series[0]).toMatchObject({ type: "bar", stack: "all" });
        expect(o.series[0].label.show).toBe(true);
    });

    it("draws one gauge per series with the threshold markers", () => {
        const s = settings();
        expect(gaugeRange([22], s)).toEqual([0, 90]);
        const o: any = gaugeOption({ series: series(s), settings: { ...s, viz: "gauge", options: { reduceOptions: { calcs: ["lastNotNull"] }, showThresholdMarkers: true } }, width: 600, height: 300 });
        expect(o.series).toHaveLength(2);
        expect(o.series[0].data[0].value).toBe(30);
        expect(o.series[0].axisLine.lineStyle.color.length).toBe(2);
        expect(o.series[0].center[0]).toBe("25%");
    });
});
