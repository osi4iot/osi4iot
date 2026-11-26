import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { bindingEffects, effectTransform, playbackDuration, playbackStamp, playsSeries, sanitizeBindings, seriesValueAt } from "./pictureBindings";
import { playbackOf, setPlayback, subscribePlayback } from "./playbackClock";
import { createLiveValueStore } from "./liveValues";
import { PictureView } from "./PicturePanel";
import { sanitizeDataChart } from "./dataChart/dataChart";

const CART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect id="spring" x="10" y="20" width="60" height="10"/><rect id="mass" x="70" y="10" width="40" height="40"/></svg>`;

describe("series played in time", () => {
    it("interpolates a series at a time, clamped at its ends", () => {
        const t = [0, 1, 2];
        const u = [0, 10, -10];
        expect(seriesValueAt(u, t, 0.5)).toBe(5);
        expect(seriesValueAt(u, t, 1.5)).toBe(0);
        expect(seriesValueAt(u, t, -1)).toBe(0);
        expect(seriesValueAt(u, t, 9)).toBe(-10);
        expect(Number.isNaN(seriesValueAt("x", t, 0))).toBe(true);
    });

    it("moves and stretches the elements at the time played", () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { resp: { t: [0, 1, 2], u: [0, 20, 0] } });
        const bindings = sanitizeBindings([
            { element: "mass", topicRef: "dtm2sim", path: "resp.u", timePath: "resp.t", action: "translateX", inMin: 0, inMax: 20, outMin: 0, outMax: 20 },
            { element: "spring", topicRef: "dtm2sim", path: "resp.u", timePath: "resp.t", action: "scaleX", inMin: 0, inMax: 60, outMin: 1, outMax: 2, cx: 10 },
            { element: "x", topicRef: "dtm2sim", path: "resp.u", timePath: "bad path!", action: "text" },
        ]);
        expect(bindings[0].timePath).toBe("resp.t");
        expect(bindings[2].timePath).toBeUndefined();
        expect(playsSeries(bindings)).toBe(true);
        expect(playbackDuration(bindings, store.get)).toBe(2);
        const effects = bindingEffects(bindings, store.get, 1);
        expect(effects.get("mass")?.translateX).toBe(20);
        expect(effects.get("spring")?.scaleX).toBeCloseTo(1 + 20 / 60);
        expect(effectTransform("", { scaleX: 1.5, cx: 10 }, { x: 40, y: 25 })).toBe("translate(10 25) scale(1.5 1) translate(-10 -25)");
        const before = playbackStamp(bindings, store.get);
        store.publish("dtm2sim", { resp: { t: [0, 1], u: [0, 1] } });
        expect(playbackStamp(bindings, store.get)).not.toBe(before);
    });

    it("shares the time of a frame with whoever listens to it", () => {
        const listener = vi.fn();
        const off = subscribePlayback("s1:f1", listener);
        setPlayback("s1:f1", { time: 0.5, duration: 2 });
        expect(listener).toHaveBeenCalledWith({ time: 0.5, duration: 2 });
        expect(playbackOf("s1:f1").time).toBe(0.5);
        off();
        setPlayback("s1:f1", { time: null, duration: 0 });
    });

    it("plays the picture in a loop, with its controls, and publishes the time", async () => {
        const store = createLiveValueStore();
        store.publish("dtm2sim", { resp: { t: [0, 1, 2], u: [0, 20, 0] } });
        const bindings = sanitizeBindings([
            { element: "mass", topicRef: "dtm2sim", path: "resp.u", timePath: "resp.t", action: "translateX", inMin: 0, inMax: 20, outMin: 0, outMax: 20 },
        ]);
        const times: (number | null)[] = [];
        const off = subscribePlayback("s:f", (s) => times.push(s.time));
        render(<PictureView file="cart.svg" bindings={bindings} store={store} load={async () => ({ url: "", svg: CART })} clockKey="s:f" speed={2} />);
        await waitFor(() => expect(screen.getByRole("group", { name: "Playback" })).toBeInTheDocument());
        expect((screen.getByLabelText("Speed") as HTMLSelectElement).value).toBe("2");
        await waitFor(() => expect(times.some((t) => t !== null && t > 0)).toBe(true));
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "From the start" })));
        await waitFor(() => expect(times[times.length - 1]).toBe(0));
        expect(times.every((t) => t === null || (t >= 0 && t <= 2))).toBe(true);
        off();
    });

    it("keeps the playback cursor of a Data chart", () => {
        const chart = sanitizeDataChart({ kind: "xy", series: [{ source: "dtm2sim", x: "resp.t", y: "resp.u" }], cursor: true });
        expect(chart?.cursor).toBe(true);
    });
});
