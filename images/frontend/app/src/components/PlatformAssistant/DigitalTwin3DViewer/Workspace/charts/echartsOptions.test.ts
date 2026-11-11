import { describe, expect, it } from "vitest";
import { chartSettingsOf, drawSeries, setPath } from "./chartConfig";
import { barchartOption, createChartPointer, shiftHue, gaugeOption, gaugeRange, nearestToPointer, timeseriesOption, withGaps } from "./echartsOptions";

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

    it("draws as a line a sensor that sends seldom, and breaks it where it stopped", () => {
        // a value every ~30-60 s (the wind speed), "Last 5 minutes": buckets of 2 s
        const sparse: [number, number][] = [[0, 11.8], [29_000, 11.8], [60_000, 11.9], [120_000, 11.8], [180_000, 11.7]];
        expect(withGaps(sparse, 2, false).filter(([, v]) => v === null)).toHaveLength(0);
        // the same sensor, silent for 10 minutes
        const stopped: [number, number][] = [...sparse, [780_000, 11.6], [810_000, 11.5]];
        expect(withGaps(stopped, 2, false).filter(([, v]) => v === null)).toHaveLength(1);
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

    it("shows the tooltip along the time axis: the series nearest to the pointer, or all of them", () => {
        const pointer = createChartPointer();
        const single: any = timeseriesOption({ series: series(), settings: settings(), from: 0, to: 120_000, bucketSeconds: 10, pointer });
        // the lines draw no points: an "item" tooltip would never appear
        expect(single.tooltip).toMatchObject({ show: true, trigger: "axis" });
        const params = [
            { seriesName: "X", color: "#5794f2", value: [10_000, 20], seriesIndex: 0 },
            { seriesName: "Y", color: "#ff9830", value: [10_000, 80], seriesIndex: 1 },
        ];
        // without the pointer: the first series
        expect(single.tooltip.formatter(params)).toContain("X");
        expect(single.tooltip.formatter(params)).not.toContain("Y:");
        // the pointer near the drawing of Y (its axis is the right one, 1)
        pointer.y = 40;
        pointer.toPixelY = (value, axis) => (axis === 1 ? 300 - value * 3 : 300 - value * 10);
        const text = single.tooltip.formatter(params);
        expect(text).toContain("Y:");
        expect(text).not.toContain("X:");
        const multi: any = timeseriesOption({ series: series(), settings: settings("options.tooltip.mode", "multi"), from: 0, to: 120_000, bucketSeconds: 10, pointer });
        expect(multi.tooltip.trigger).toBe("axis");
        expect(multi.tooltip.formatter(params)).toContain("X:");
        expect(multi.tooltip.formatter(params)).toContain("Y:");
        expect(nearestToPointer([], () => 0, pointer)).toEqual([]);
    });

    it("fills with a gradient of hue even with Fill opacity at 0", () => {
        const s = settings("fieldConfig.defaults.custom.gradientMode", "hue");
        const o: any = timeseriesOption({ series: series(s), settings: s, from: 0, to: 120_000, bucketSeconds: 10 });
        const stops = o.series[0].areaStyle.color.colorStops;
        expect(o.series[0].areaStyle.color).toMatchObject({ x: 0, y: 0, x2: 0, y2: 1 });
        // visible: not transparent at the top, and a different hue from the bottom
        expect(stops[0].color).toMatch(/rgba\(\d+, \d+, \d+, 0\.35\)/);
        expect(stops[0].color).not.toBe(stops[1].color);
        expect(o.series[0].lineStyle.color.colorStops).toHaveLength(2);
        expect(shiftHue("#ff0000", 120)).toBe("#00ff00");
        expect(shiftHue("#5794f2", 0)).toBe("#5794f2");
        expect(shiftHue("red", 40)).toBe("red");
    });
});
