import { act, render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("echarts/core", () => ({ use: vi.fn(), init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }) }));

import ChartPanel from "../ChartPanel";
import { chartSeriesOptions } from "../chartSeries";
import { REFRESH_INTERVALS, createRefreshClock, refreshMs, spanMs } from "./timeRange";

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
});

describe("fast refresh", () => {
    it("offers 200ms and 1s, in milliseconds only for the refresh", () => {
        expect(REFRESH_INTERVALS.slice(0, 4)).toEqual(["", "200ms", "1s", "5s"]);
        expect(refreshMs("200ms")).toBe(200);
        expect(refreshMs("1s")).toBe(1000);
        expect(refreshMs("")).toBeNull();
        expect(spanMs("200ms")).toBeNull();
    });

    it("ticks a clock that only its subscribers hear", () => {
        const clock = createRefreshClock();
        const heard = vi.fn();
        const off = clock.subscribe(heard);
        clock.bump();
        expect([clock.get(), heard.mock.calls.length]).toEqual([1, 1]);
        off();
        clock.bump();
        expect([clock.get(), heard.mock.calls.length]).toEqual([2, 1]);
    });

    it("does not cancel a request on its way at a refresh: it skips the refresh", async () => {
        const options = chartSeriesOptions([{ id: 1, assetId: 7, sensorRef: "sensor_1", sensorTypeId: 1, description: "Rotor", measurements: { rpm: { type: "number", label: "Rotor speed", units: "rpm" } } }] as any, [], 7);
        const NOW = Date.parse("2026-11-09T12:00:00Z");
        const answers: ((v: any) => void)[] = [];
        const signals: AbortSignal[] = [];
        const fetchSeries = vi.fn((_q: any, signal: AbortSignal) => {
            signals.push(signal);
            return new Promise<any>((resolve) => answers.push(resolve));
        });
        const panel: any = { id: "c", type: "chart", series: [{ sensor: "sensor_1", field: "rpm" }], x: 0, y: 0, w: 6, h: 5 };
        const view = (tick: number, from = NOW - 3600_000) => (
            <ChartPanel panel={panel} groupId={3} options={options} fetchSeries={fetchSeries} pageRange={{ from: from + tick * 200, to: NOW + tick * 200 }} refreshTick={tick} now={() => NOW} />
        );
        const { rerender } = render(view(0));
        await waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
        rerender(view(1));
        rerender(view(2));
        expect(fetchSeries).toHaveBeenCalledTimes(1);
        expect(signals[0].aborted).toBe(false);
        await act(async () => answers[0]({ from: "", to: "", bucketSeconds: 10, series: [] }));
        rerender(view(3));
        await waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(2));
        // a range chosen by the user (not a refresh) does replace the request on its way
        rerender(view(3, NOW - 7200_000));
        await waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(3));
        expect(signals[1].aborted).toBe(true);
    });
});
