import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("echarts/core", () => ({ use: vi.fn(), init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }) }));

import PanelEditor from "./PanelEditor";
import { chartSeriesOptions } from "./chartSeries";

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
});

const options = chartSeriesOptions(
    [
        { id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Rotor", measurements: { rpm: { type: "number", label: "Rotor speed", units: "rpm" } } },
        { id: 2, assetId: 7, sensorRef: "sensor_2", sensorTypeId: 1, description: "Tower", measurements: { acc: { type: "array", label: "Ax,Ay", units: "m/s^2" } } },
    ],
    [],
    7,
);
const NOW = Date.parse("2026-11-09T12:00:00Z");
const panel: any = { id: "chart-1", type: "chart", title: "Rotor", series: [{ sensor: "sensor_1", field: "rpm" }], x: 0, y: 0, w: 6, h: 5 };

const setup = async () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    const fetchSeries = vi.fn().mockResolvedValue({ from: "", to: "", bucketSeconds: 10, series: [{ sensorId: 1, field: "rpm", label: "Rotor speed", units: "rpm", sensor: "Rotor", points: [[NOW, 12, 11, 13, 4, 48, 12, 11]] }] });
    await act(async () => {
        render(<PanelEditor panel={panel} groupId={3} chartOptions={options} fetchSeries={fetchSeries} pageRange={{ from: NOW - 3600_000, to: NOW }} refreshTick={0} onApply={onApply} onDiscard={onDiscard} now={() => NOW} />);
    });
    return { onApply, onDiscard, fetchSeries };
};

describe("Panel editor", () => {
    it("changes the visualization and its options, and gives the panel back", async () => {
        const { onApply } = await setup();
        expect(screen.getByRole("dialog", { name: "Edit panel Rotor" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Graph styles/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Time series/ }));
        fireEvent.click(within(screen.getByRole("listbox", { name: "Visualizations" })).getByRole("option", { name: /^Stat\b/ }));
        expect(screen.queryByRole("button", { name: /Graph styles/ })).toBeNull();
        fireEvent.change(screen.getByLabelText("Color mode"), { target: { value: "background_solid" } });
        fireEvent.click(screen.getByRole("radio", { name: "None" }));
        fireEvent.click(screen.getByRole("button", { name: "Add threshold" }));
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        const applied = onApply.mock.calls[0][0];
        expect(applied.viz).toBe("stat");
        expect(applied.options).toEqual({ colorMode: "background_solid", graphMode: "none" });
        expect(applied.fieldConfig.defaults.thresholds.steps).toHaveLength(3);
    });

    it("edits the series and the query options", async () => {
        const { onApply } = await setup();
        fireEvent.click(screen.getByRole("button", { name: "Add series" }));
        fireEvent.change(screen.getByLabelText("Aggregation of series A"), { target: { value: "max" } });
        fireEvent.change(screen.getByLabelText("Display name of series B"), { target: { value: "Fore-aft" } });
        fireEvent.change(screen.getByLabelText("Axis of series B"), { target: { value: "right" } });
        fireEvent.change(screen.getByLabelText("Relative time"), { target: { value: "24h" } });
        fireEvent.change(screen.getByLabelText("Min interval"), { target: { value: "bad" } });
        expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
        fireEvent.change(screen.getByDisplayValue("bad"), { target: { value: "1m" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        expect(onApply.mock.calls[0][0]).toMatchObject({
            series: [{ sensor: "sensor_1", field: "rpm", agg: "max" }, { sensor: "sensor_2", field: "acc", index: 0, alias: "Fore-aft", axis: "right" }],
            timeFrom: "24h",
            interval: "1m",
        });
    });

    it("finds options and discards the changes", async () => {
        const { onDiscard, onApply } = await setup();
        fireEvent.change(screen.getByRole("searchbox", { name: "Search options" }), { target: { value: "fill opacity" } });
        expect(screen.getByLabelText("Fill opacity")).toBeInTheDocument();
        expect(screen.queryByLabelText("Unit")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Discard" }));
        expect(onDiscard).toHaveBeenCalled();
        expect(onApply).not.toHaveBeenCalled();
    });
});
