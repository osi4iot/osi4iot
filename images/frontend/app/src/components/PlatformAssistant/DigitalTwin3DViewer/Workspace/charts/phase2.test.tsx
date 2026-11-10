import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { chartSettingsOf, drawSeries, fieldFor, interpolateLink, interpolateTitle, setPath, validLinks, withChartSettings } from "./chartConfig";
import { histogramOption, pieOption, timeseriesOption } from "./echartsOptions";
import { TableViz, stateSegments } from "./HtmlViz";
import OverridesEditor from "./OverridesEditor";

const buckets = [
    [0, 0, 0, 0, 2, 0, 0, 0],
    [10_000, 0, 0, 0, 2, 0, 0, 0],
    [20_000, 1, 1, 1, 2, 2, 1, 1],
    [30_000, 2, 2, 2, 2, 4, 2, 2],
] as any;
const settings = (over: any = {}) => chartSettingsOf({ id: "c", type: "chart", x: 0, y: 0, w: 1, h: 1, ...over } as any);
const sources = [
    { ref: { sensor: "a", field: "x" }, label: "Ax", sensorDescription: "A", units: "m/s^2", buckets },
    { ref: { sensor: "a", field: "y" }, label: "Ay", sensorDescription: "A", units: "m/s^2", buckets },
];

describe("overrides", () => {
    it("apply to the series by name or regular expression, in order", () => {
        const s = settings({
            fieldConfig: {
                defaults: { unit: "accMS2" },
                overrides: [
                    { matcher: { id: "byName", options: "Ay" }, properties: [{ id: "color", value: { mode: "fixed", fixedColor: "purple" } }, { id: "displayName", value: "Side-side" }, { id: "custom.lineWidth", value: 4 }] },
                    { matcher: { id: "byRegexp", options: "^A" }, properties: [{ id: "unit", value: "accG" }, { id: "custom.hideFrom", value: { legend: true } }] },
                    { matcher: { id: "byRegexp", options: "(" }, properties: [{ id: "unit", value: "none" }] },
                ],
            },
        });
        expect(fieldFor(s, "Ax").unit).toBe("accG");
        const out = drawSeries(sources, s);
        expect(out.map((x) => [x.name, x.color, x.unit, x.hideFromLegend])).toEqual([
            ["Ax", "#73BF69", "accG", true],
            ["Side-side", "#B877D9", "accG", true],
        ]);
        const o: any = timeseriesOption({ series: out, settings: s, from: 0, to: 40_000, bucketSeconds: 10 });
        expect(o.series[1].lineStyle.width).toBe(4);
        expect(o.series[0].lineStyle.width).toBe(1);
        // kept when the panel is saved
        expect(withChartSettings({ id: "c", type: "chart", x: 0, y: 0, w: 1, h: 1 } as any, s).fieldConfig).toMatchObject({ overrides: s.fieldConfig.overrides });
    });

    it("are edited by series name with their properties", () => {
        const onChange = vi.fn();
        const { rerender } = render(<OverridesEditor overrides={[]} seriesNames={["Ax", "Ay"]} viz="timeseries" onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Kind of the new override"), { target: { value: "Ay" } });
        fireEvent.click(screen.getByRole("button", { name: "Add field override" }));
        const added = onChange.mock.calls[0][0];
        expect(added).toEqual([{ matcher: { id: "byName", options: "Ay" }, properties: [] }]);
        rerender(<OverridesEditor overrides={added} seriesNames={["Ax", "Ay"]} viz="timeseries" onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Add property to override 1"), { target: { value: "custom.lineWidth" } });
        expect(onChange.mock.calls[1][0][0].properties).toEqual([{ id: "custom.lineWidth", value: 2 }]);
        rerender(<OverridesEditor overrides={onChange.mock.calls[1][0]} seriesNames={["Ax", "Ay"]} viz="timeseries" onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Graph styles › Line width value"), { target: { value: "6" } });
        expect(onChange.mock.calls[2][0][0].properties[0].value).toBe(6);
        // stat has no graph styles
        rerender(<OverridesEditor overrides={added} seriesNames={["Ax"]} viz="stat" onChange={onChange} />);
        expect(within(screen.getByLabelText("Add property to override 1")).queryByText("Graph styles › Line width")).toBeNull();
    });
});

describe("links", () => {
    it("replace their variables and only open safe addresses", () => {
        expect(interpolateLink("https://x.org/d?v=${__value.raw}&s=${__series.name}&${__url_time_range}", { value: 1.5, seriesName: "Line 1", from: 10, to: 20 })).toBe(
            "https://x.org/d?v=1.5&s=Line%201&from=10&to=20",
        );
        expect(interpolateLink("/grafana/d/abc?t=${__value.time}", { time: 5 })).toBe("/grafana/d/abc?t=5");
        expect(interpolateLink("javascript:alert(1)", {})).toBeNull();
        expect(interpolateLink("${__series.name}", { seriesName: "javascript:x" })).toBeNull();
        expect(interpolateTitle("Detail ${__series.name} = ${__value.raw}", { seriesName: "Ay", value: 2 })).toBe("Detail Ay = 2");
        expect(validLinks([{ title: "a", url: "//evil" }, { title: "b", url: "https://ok" }, null])).toEqual([{ title: "b", url: "https://ok" }]);
    });
});

describe("new visualizations", () => {
    it("draws a pie of the reduced values, as a donut with labels", () => {
        const s = setPath(setPath(settings({ viz: "piechart" }), "options.pieType", "donut"), "options.displayLabels", ["name", "percent"]);
        const o: any = pieOption({ series: drawSeries(sources, s), settings: s });
        expect(o.series[0].radius).toEqual(["45%", "72%"]);
        expect(o.series[0].data.map((d: any) => [d.name, d.value])).toEqual([["Ax", 2], ["Ay", 2]]);
        expect(o.series[0].label.formatter({ name: "Ax", value: 2, dataIndex: 0 })).toBe("Ax\n50%");
    });

    it("draws histogram bins, apart or combined", () => {
        const s = settings({ viz: "histogram" });
        const src = sources.map((x, i) => ({ ...x, buckets: [], bins: [[0, 3 + i], [1, 5]] as [number, number][] }));
        const o: any = histogramOption({ series: drawSeries(src, s), settings: s, size: 1 });
        expect(o.series).toHaveLength(2);
        expect(o.series[0].data).toEqual([[0.5, 3], [1.5, 5]]);
        const combined: any = histogramOption({ series: drawSeries(src, setPath(s, "options.combine", true)), settings: setPath(s, "options.combine", true), size: 1 });
        expect(combined.series[0].data).toEqual([[0.5, 7], [1.5, 10]]);
    });

    it("turns values into states with the value mappings, merging equal ones", () => {
        const s = setPath(settings({ viz: "statetimeline" }), "fieldConfig.defaults.mappings", [
            { type: "value", value: "0", text: "Off", color: "red" },
            { type: "range", from: 1, to: 5, text: "On", color: "green" },
        ]);
        const [series] = drawSeries(sources, s);
        const segs = stateSegments(series, s, 0, 40_000, 10, true);
        expect(segs.map((x) => [x.from, x.to, x.text, x.color])).toEqual([
            [0, 20_000, "Off", "#F2495C"],
            [20_000, 40_000, "On", "#73BF69"],
        ]);
        expect(stateSegments(series, s, 0, 40_000, 10, false)).toHaveLength(4);
    });

    it("shows one table row per series with its calculations", () => {
        const s = setPath(setPath(settings({ viz: "table" }), "options.rowMode", "series"), "options.rowCalcs", ["max", "mean"]);
        render(<TableViz series={drawSeries(sources, s)} settings={s} bucketSeconds={10} />);
        const rows = screen.getAllByRole("row");
        expect(rows[0]).toHaveTextContent("NameMaxMean");
        expect(rows[1]).toHaveTextContent("Ax2 m/s²0.750 m/s²");
    });
});
