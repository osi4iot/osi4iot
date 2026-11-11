import { describe, expect, it, vi } from "vitest";
import { createFrameStore } from "./frameStore";

const blob = (text: string) => new Blob([text]);

describe("frame store", () => {
    it("hands each frame to the listeners of its source and of any source", () => {
        const { store, publish } = createFrameStore();
        const any = vi.fn();
        const pipeline = vi.fn();
        const device = vi.fn();
        store.subscribe(any);
        store.subscribe(pipeline, "dtm2sim");
        const off = store.subscribe(device, "dev2sim");
        const a = blob("a");
        publish(a, "dtm2sim");
        expect(any).toHaveBeenCalledWith(a, expect.any(Number));
        expect(pipeline).toHaveBeenCalledWith(a, expect.any(Number));
        expect(device).not.toHaveBeenCalled();
        off();
        publish(blob("b"), "dev2sim");
        expect(device).not.toHaveBeenCalled();
        expect(any).toHaveBeenCalledTimes(2);
    });

    it("gives a new listener the latest frame of its source", () => {
        const { store, publish } = createFrameStore();
        const a = blob("a");
        const b = blob("b");
        publish(a, "dtm2sim");
        publish(b, "dev2sim");
        const late = vi.fn();
        store.subscribe(late, "dtm2sim");
        expect(late).toHaveBeenCalledWith(a, expect.any(Number));
        const lateAny = vi.fn();
        store.subscribe(lateAny);
        expect(lateAny).toHaveBeenCalledWith(b, expect.any(Number));
    });

    it("reports the sources that have sent frames", () => {
        const { store, publish } = createFrameStore();
        const sources = vi.fn();
        store.subscribeSources(sources);
        expect(sources).toHaveBeenLastCalledWith([]);
        publish(blob("a"), "dtm2sim");
        publish(blob("b"), "dtm2sim");
        publish(blob("c"), "dev2sim");
        publish(blob("d"));
        expect(sources).toHaveBeenCalledTimes(3);
        expect(sources).toHaveBeenLastCalledWith(["dev2sim", "dtm2sim"]);
    });
});
