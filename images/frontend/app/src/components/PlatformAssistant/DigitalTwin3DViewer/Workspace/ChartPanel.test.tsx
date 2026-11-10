import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const setOption = vi.fn();
vi.mock("echarts/core", () => ({
    use: vi.fn(),
    init: () => ({ setOption, resize: vi.fn(), dispose: vi.fn() }),
}));

import ChartPanel from "./ChartPanel";
import { chartSeriesOptions, TimeSeriesResponse } from "./chartSeries";

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
});

const options = chartSeriesOptions(
    [
        { id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Rotor", measurements: { rpm: { type: "number", label: "Rotor speed", units: "rpm" } } },
        { id: 2, assetId: 7, sensorRef: "sensor_2", sensorTypeId: 1, description: "Tower", measurements: { acc: { type: "number", label: "Acceleration", units: "m/s^2" } } },
    ],
    [],
    7,
);
const NOW = Date.parse("2026-11-09T12:00:00Z");
const PAGE = { from: NOW - 3600_000, to: NOW };
const answer = (points: any[]): TimeSeriesResponse => ({
    from: new Date(PAGE.from).toISOString(),
    to: new Date(PAGE.to).toISOString(),
    bucketSeconds: 10,
    series: [{ sensorId: 1, field: "rpm", label: "Rotor speed", units: "rpm", sensor: "Rotor", points }],
});
const panel = (over: Record<string, unknown> = {}): any => ({ id: "chart-1", type: "chart", series: [{ sensor: "sensor_1", field: "rpm" }], x: 0, y: 0, w: 6, h: 5, ...over });

beforeEach(() => setOption.mockClear());

describe("Chart panel", () => {
    it("asks for its series over the page range and draws a time series", async () => {
        const fetchSeries = vi.fn().mockResolvedValue(answer([[NOW - 60_000, 12, 11, 13, 6, 72, 12.5, 11.5]]));
        render(<ChartPanel panel={panel()} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={0} now={() => NOW} />);
        await waitFor(() => expect(setOption).toHaveBeenCalled());
        expect(fetchSeries.mock.calls[0][0]).toMatchObject({ groupId: 3, series: [{ sensorId: 1, field: "rpm" }], from: PAGE.from, to: PAGE.to, points: 300 });
        const option = setOption.mock.calls.at(-1)![0];
        expect(option.series[0]).toMatchObject({ type: "line", name: "Rotor speed" });
        expect(screen.getByRole("list", { name: "Legend" })).toHaveTextContent("Rotor speed");
    });

    it("uses its own relative time, time shift and interval, and asks again at each refresh", async () => {
        const fetchSeries = vi.fn().mockResolvedValue(answer([]));
        const { rerender } = render(
            <ChartPanel panel={panel({ timeFrom: "24h", timeShift: "1d", interval: "1m", maxDataPoints: 100 })} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={0} now={() => NOW} />,
        );
        expect(await screen.findByText("No data")).toBeInTheDocument();
        expect(screen.getByText("Last 24 hours, shifted 1d")).toBeInTheDocument();
        expect(fetchSeries.mock.calls[0][0]).toMatchObject({ from: NOW - 2 * 86400_000, to: NOW - 86400_000, interval: "1m", points: 100 });
        rerender(<ChartPanel panel={panel({ timeFrom: "24h", timeShift: "1d", interval: "1m", maxDataPoints: 100 })} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={1} now={() => NOW} />);
        await waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(2));
    });

    it("draws a Stat with the colour of its thresholds", async () => {
        const fetchSeries = vi.fn().mockResolvedValue(answer([[NOW - 60_000, 85, 80, 90, 6, 510, 88, 82]]));
        render(
            <ChartPanel
                panel={panel({ viz: "stat", options: { colorMode: "background_solid", graphMode: "none" }, fieldConfig: { defaults: { thresholds: { mode: "absolute", steps: [{ value: null, color: "green" }, { value: 80, color: "red" }] } } } })}
                groupId={3}
                options={options}
                fetchSeries={fetchSeries}
                pageRange={PAGE}
                refreshTick={0}
                now={() => NOW}
            />,
        );
        const tile = await screen.findByLabelText("Rotor speed: 88 rpm");
        expect(tile).toHaveAttribute("data-color", "#F2495C");
    });

    it("says when its sensors no longer exist, and asks for nothing while paused", () => {
        const fetchSeries = vi.fn();
        const { unmount } = render(<ChartPanel panel={panel({ series: [{ sensor: "gone", field: "x" }] })} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={0} />);
        expect(screen.getByText("The sensors of this chart no longer exist.")).toBeInTheDocument();
        unmount();
        render(<ChartPanel panel={panel()} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={0} paused />);
        expect(fetchSeries).not.toHaveBeenCalled();
    });

    it("shows the error of the first request", async () => {
        const fetchSeries = vi.fn().mockRejectedValue({ response: { data: { message: "Sensors not found in the group: 1" } } });
        render(<ChartPanel panel={panel()} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={PAGE} refreshTick={0} now={() => NOW} />);
        expect(await screen.findByText("Sensors not found in the group: 1")).toBeInTheDocument();
    });
});
