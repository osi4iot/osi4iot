import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileVideoForm, { frameSize, MAX_FRAME_SIDE } from "./MobileVideoForm";

const topic: any = { id: 2, orgAcronym: "EEBE", groupAcronym: "G", assetDescription: "Portico", sensorType: "Mobile video", sensorDescription: "Mobile video sensor", groupUid: "g1", assetUid: "a1", topicUid: "t1" };

describe("mobile video", () => {
    let flushes: (() => void)[];
    let nc: any;
    beforeEach(() => {
        window.localStorage.clear();
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] });
        flushes = [];
        nc = { publish: vi.fn(), flush: vi.fn(() => new Promise<void>((r) => flushes.push(r))) };
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined as any);
        Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
        Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
        Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as any);
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
            cb({ arrayBuffer: async () => new ArrayBuffer(30 * 1024) } as any);
        });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("waits for NATS to confirm each frame before taking the next one, and shows what is really sent", async () => {
        window.localStorage.setItem("osi4iot.mobileSensors", JSON.stringify({ settings: { t1: { fps: 5 } } }));
        render(<MobileVideoForm natsClient={nc} isNatsConnected setMobileSensorSelected={vi.fn()} mobileTopicSelected={topic} />);
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "READ" })));
        // 5 fps: a frame every 200 ms; the first is not confirmed yet, so the next ticks take no frame
        await act(async () => vi.advanceTimersByTime(200));
        await act(async () => vi.advanceTimersByTime(600));
        expect(nc.publish).toHaveBeenCalledTimes(1);
        expect(nc.publish.mock.calls[0][0]).toBe("dev2dtm.Group_g1.Topic_t1");
        // confirmed: the next tick sends again
        await act(async () => flushes.shift()!());
        await act(async () => vi.advanceTimersByTime(200));
        expect(nc.publish).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("status")).toHaveTextContent(/Sending 1\.0 of 5 fps · 30 KB per frame/);
        expect(screen.getByRole("status")).toHaveTextContent(/the connection does not keep up/);
    });

    it("scales a large camera frame down to 640 px on its longest side before encoding it", async () => {
        Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 });
        Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 });
        const drawImage = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as any);
        window.localStorage.setItem("osi4iot.mobileSensors", JSON.stringify({ settings: { t1: { fps: 5 } } }));
        render(<MobileVideoForm natsClient={nc} isNatsConnected setMobileSensorSelected={vi.fn()} mobileTopicSelected={topic} />);
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "READ" })));
        await act(async () => vi.advanceTimersByTime(200));
        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 360);
        await act(async () => flushes.shift()!());
        await act(async () => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("status")).toHaveTextContent(/camera 1920×1080 → sent 640×360/);
    });
});

describe("frameSize", () => {
    it("scales down to the maximum side, keeping the proportions, and never scales up", () => {
        expect(MAX_FRAME_SIDE).toBe(640);
        expect(frameSize(1920, 1080)).toEqual({ width: 640, height: 360 });
        expect(frameSize(1080, 1920)).toEqual({ width: 360, height: 640 }); // portrait
        expect(frameSize(4032, 3024)).toEqual({ width: 640, height: 480 });
        expect(frameSize(640, 480)).toEqual({ width: 640, height: 480 });
        expect(frameSize(320, 240)).toEqual({ width: 320, height: 240 });
    });
});
