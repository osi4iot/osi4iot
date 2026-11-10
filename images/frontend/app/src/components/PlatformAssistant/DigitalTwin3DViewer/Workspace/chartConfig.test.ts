import { describe, expect, it } from "vitest";
import {
    applyMappings,
    changeViz,
    chartSettingsOf,
    drawSeries,
    formatValue,
    formatWithUnit,
    reduceBuckets,
    setPath,
    thresholdColor,
    unitFromSensor,
    withChartSettings,
} from "./chartConfig";

const buckets = [
    [0, 10, 5, 15, 2, 20, 15, 5],
    [10, 20, 18, 22, 4, 80, 22, 18],
    [20, null, null, null, 0, null, null, null],
] as any;

describe("chart settings", () => {
    it("completes a panel with Grafana's defaults and keeps only the changes", () => {
        const panel: any = { id: "c", type: "chart", series: [], x: 0, y: 0, w: 1, h: 1, range: "6h" };
        const s = chartSettingsOf(panel);
        expect(s.viz).toBe("timeseries");
        expect(s.options.legend).toMatchObject({ showLegend: true, displayMode: "list", placement: "bottom" });
        expect(s.fieldConfig.defaults.custom).toMatchObject({ drawStyle: "line", lineWidth: 1, fillOpacity: 0 });
        const changed = setPath(s, "fieldConfig.defaults.custom.fillOpacity", 25);
        const saved = withChartSettings(panel, changed);
        expect(saved.range).toBeUndefined();
        expect(saved.options).toEqual({});
        expect(saved.fieldConfig).toEqual({ defaults: { custom: { fillOpacity: 25 } } });
        expect(chartSettingsOf(saved).fieldConfig.defaults.custom?.fillOpacity).toBe(25);
    });

    it("keeps what two visualizations share when it changes", () => {
        let s = chartSettingsOf({ id: "c", type: "chart", x: 0, y: 0, w: 1, h: 1 } as any);
        s = setPath(s, "fieldConfig.defaults.unit", "rotrpm");
        const stat = changeViz(s, "stat");
        expect(stat.viz).toBe("stat");
        expect(stat.fieldConfig.defaults.unit).toBe("rotrpm");
        expect(stat.options).toMatchObject({ colorMode: "value", graphMode: "area" });
        expect(stat.options.legend).toBeUndefined();
    });

    it("colours by thresholds and value mappings", () => {
        const thr = { mode: "absolute" as const, steps: [{ value: null, color: "green" }, { value: 50, color: "orange" }, { value: 80, color: "red" }] };
        expect(thresholdColor(10, thr)).toBe("#73BF69");
        expect(thresholdColor(60, thr)).toBe("#FF9830");
        expect(thresholdColor(95, thr)).toBe("#F2495C");
        expect(thresholdColor(0.6, { mode: "percentage", steps: thr.steps }, 0, 1)).toBe("#FF9830");
        const maps = [{ type: "value" as const, value: "1", text: "On", color: "green" }, { type: "range" as const, from: 2, to: 5, text: "Busy" }];
        expect(applyMappings(1, maps)).toEqual({ text: "On", color: "green" });
        expect(applyMappings(3, maps)).toEqual({ text: "Busy", color: undefined });
        expect(applyMappings(9, maps)).toBeNull();
    });

    it("writes values with units and decimals", () => {
        expect(unitFromSensor("m/s^2")).toBe("accMS2");
        expect(unitFromSensor("rpm")).toBe("rotrpm");
        expect(unitFromSensor("kN")).toBe("forcekn");
        expect(unitFromSensor("bananas")).toBe("suffix:bananas");
        expect(unitFromSensor("-")).toBe("none");
        expect(formatWithUnit(12.345, "rotrpm")).toBe("12.35 rpm");
        expect(formatWithUnit(0.5, "percentunit", 0)).toBe("50%");
        expect(formatWithUnit(1500, "short")).toBe("1.50 K");
        expect(formatWithUnit(3, "suffix:pcs")).toBe("3 pcs");
        expect(formatValue(null).text).toBe("No data");
        expect(formatWithUnit(0.00123, "none")).toBe("0.00123");
    });

    it("reduces the buckets with the aggregates of each one", () => {
        expect(reduceBuckets(buckets, "lastNotNull")).toBe(22);
        expect(reduceBuckets(buckets, "first")).toBe(5);
        expect(reduceBuckets(buckets, "min")).toBe(5);
        expect(reduceBuckets(buckets, "max")).toBe(22);
        expect(reduceBuckets(buckets, "mean")).toBeCloseTo(100 / 6);
        expect(reduceBuckets(buckets, "sum")).toBe(100);
        expect(reduceBuckets(buckets, "count")).toBe(6);
        expect(reduceBuckets(buckets, "range")).toBe(17);
        expect(reduceBuckets(buckets, "delta")).toBe(17);
        expect(reduceBuckets([], "mean")).toBeNull();
    });

    it("names and colours the series", () => {
        const s = chartSettingsOf({ id: "c", type: "chart", x: 0, y: 0, w: 1, h: 1 } as any);
        const sources = [
            { ref: { sensor: "a", field: "t" }, label: "Temp", sensorDescription: "North", units: "°C", buckets },
            { ref: { sensor: "b", field: "t", agg: "max" as const, color: "purple", axis: "right" as const }, label: "Temp", sensorDescription: "South", units: "°C", buckets },
        ];
        const out = drawSeries(sources, s);
        expect(out.map((x) => [x.name, x.color, x.axis, x.unit])).toEqual([
            ["Temp · North", "#73BF69", "left", "celsius"],
            ["Temp · South", "#B877D9", "right", "celsius"],
        ]);
        expect(out[1].values.slice(0, 2)).toEqual([[0, 15], [10, 22]]);
    });
});
