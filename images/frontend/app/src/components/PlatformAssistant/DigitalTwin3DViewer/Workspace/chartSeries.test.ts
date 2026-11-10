import { describe, expect, it } from "vitest";
import { buildChartOption, chartSeriesOptions, defaultChartTitle, formatBucket, lineData, resolveSeries, TimeSeriesResponse } from "./chartSeries";

const sensors = [
    { id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Thermometer", measurements: { temperature: { type: "number", label: "Temperature", units: "°C" } } },
    { id: 2, assetId: 7, sensorRef: "sensor_2", sensorTypeId: 2, description: "Accelerometer", measurements: "{}" },
    { id: 3, assetId: 8, sensorRef: "sensor_1", sensorTypeId: 1, description: "Other asset", measurements: { temperature: { type: "number", label: "T", units: "°C" } } },
];
const types = [{ id: 2, defaultMeasurements: { acc: { type: "array", label: "Ax, Ay,Az", units: "m/s^2" } } }];

describe("chart series", () => {
    it("lists the fields of the asset's sensors, one per item of an array", () => {
        const options = chartSeriesOptions(sensors, types, 7);
        expect(options.map((o) => [o.key, o.label, o.units, o.sensorId])).toEqual([
            ["sensor_1|temperature|", "Temperature", "°C", 1],
            ["sensor_2|acc|0", "Ax", "m/s^2", 2],
            ["sensor_2|acc|1", "Ay", "m/s^2", 2],
            ["sensor_2|acc|2", "Az", "m/s^2", 2],
        ]);
    });

    it("finds the series of a panel and the ones that no longer exist", () => {
        const options = chartSeriesOptions(sensors, types, 7);
        const { found, missing } = resolveSeries(
            [{ sensor: "sensor_2", field: "acc", index: 1 }, { sensor: "sensor_9", field: "x" }],
            options,
        );
        expect(found.map((o) => o.label)).toEqual(["Ay"]);
        expect(missing).toEqual([{ sensor: "sensor_9", field: "x" }]);
        expect(defaultChartTitle(options)).toBe("Temperature, Ax, Ay…");
        expect(defaultChartTitle([])).toBe("Chart");
    });

    it("breaks the line where there is no data", () => {
        const points: any = [[0, 1, 1, 1, 1], [10_000, 2, 2, 2, 1], [100_000, 3, 3, 3, 1]];
        expect(lineData(points, 10)).toEqual([[0, 1], [10_000, 2], [20_000, null], [100_000, 3]]);
        expect(formatBucket(10)).toBe("10 s");
        expect(formatBucket(600)).toBe("10 min");
        expect(formatBucket(7200)).toBe("2 h");
        expect(formatBucket(86400)).toBe("1 d");
    });

    it("builds the chart: one axis per unit, names and tooltip", () => {
        const data: TimeSeriesResponse = {
            from: "2026-11-09T10:00:00Z",
            to: "2026-11-09T11:00:00Z",
            bucketSeconds: 10,
            series: [
                { sensorId: 1, field: "temperature", label: "Temperature", units: "°C", sensor: "Thermo A", points: [[Date.parse("2026-11-09T10:00:00Z"), 21.5, 20, 23, 10]] },
                { sensorId: 4, field: "temperature", label: "Temperature", units: "°C", sensor: "Thermo B", points: [] },
                { sensorId: 2, field: "acc", index: 0, label: "<Ax>", units: "m/s^2", sensor: "Acc", points: [] },
            ],
        };
        const option = buildChartOption(data, Date.parse("2026-11-09T12:00:00Z"));
        expect(option.series.map((s) => [s.name, s.yAxisIndex])).toEqual([
            ["Temperature · Thermo A", 0],
            ["Temperature · Thermo B", 0],
            ["<Ax>", 1],
        ]);
        expect(option.yAxis.map((a: any) => a.name)).toEqual(["°C", "m/s^2"]);
        expect(option.xAxis.max).toBe(Date.parse("2026-11-09T11:00:00Z"));
        const html = option.tooltip.formatter([
            { seriesName: "Temperature · Thermo A", color: "#5794f2", value: [Date.parse("2026-11-09T10:00:00Z"), 21.5] },
            { seriesName: "<Ax>", color: "#f00", value: [Date.parse("2026-11-09T10:00:00Z"), null] },
        ]);
        expect(html).toContain("<b>21.5</b> °C");
        expect(html).toContain("(20 … 23)");
        expect(html).not.toContain("<Ax>");
    });
});
