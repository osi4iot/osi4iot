import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
    MAX_MESSAGE_BYTES,
    downmixResample,
    encodeWav,
    fileKindOf,
    frameTimes,
    getInjectFile,
    getInjectStatus,
    injectFile,
    mimeTypeOf,
    scaledSize,
    sendsAsIs,
    setInjectFile,
} from "./injectFile";
import { InjectFileSettingsEditor } from "./InjectFileSettings";

describe("inject a file: helpers", () => {
    it("knows the kind of a file by its type or its extension", () => {
        expect(fileKindOf({ name: "a.MP4", type: "" })).toBe("video");
        expect(fileKindOf({ name: "a.bin", type: "image/png" })).toBe("image");
        expect(fileKindOf({ name: "voice.m4a", type: "" })).toBe("audio");
        expect(fileKindOf({ name: "notes.txt", type: "text/plain" })).toBeNull();
        expect(mimeTypeOf({ name: "x.webm", type: "audio/webm;codecs=opus" })).toBe("audio/webm");
    });

    it("sends small files the pipelines read as they are", () => {
        expect(sendsAsIs("image", "image/jpeg", 100_000)).toBe(true);
        expect(sendsAsIs("image", "image/webp", 100_000)).toBe(false);
        expect(sendsAsIs("image", "image/png", MAX_MESSAGE_BYTES + 1)).toBe(false);
        expect(sendsAsIs("audio", "audio/mpeg", 500_000)).toBe(true);
        expect(sendsAsIs("video", "video/mp4", 1000)).toBe(false);
    });

    it("samples the frames of a video and scales them down", () => {
        expect(frameTimes(1, 10)).toHaveLength(10);
        expect(frameTimes(62.7, 10)).toHaveLength(627);
        expect(frameTimes(0.05, 10)).toEqual([0]);
        expect(frameTimes(0, 10)).toEqual([]);
        expect(scaledSize(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
        expect(scaledSize(360, 640, 1280)).toEqual({ width: 360, height: 640 });
    });

    it("makes 16 kHz mono WAV", () => {
        const left = new Float32Array(48000).fill(0.5);
        const right = new Float32Array(48000).fill(-0.5);
        const mono = downmixResample([left, right], 48000, 16000);
        expect(mono).toHaveLength(16000);
        expect(Math.abs(mono[100])).toBeLessThan(1e-6);
        const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
        const view = new DataView(wav.buffer);
        expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
        expect(view.getUint32(24, true)).toBe(16000);
        expect(view.getInt16(46, true)).toBe(32767);
        expect(view.getInt16(48, true)).toBe(-32768);
        expect(wav.length).toBe(44 + 6);
    });
});

describe("inject a file: sending", () => {
    it("sends an image as is, with the node's header", async () => {
        const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "frame.jpg", { type: "image/jpeg" });
        const publish = vi.fn();
        const result = await injectFile("n1", file, {}, publish);
        expect(result).toEqual({ sent: 1, stopped: false });
        const [data, headers] = publish.mock.calls[0];
        expect(Array.from(data as Uint8Array)).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
        expect(headers).toMatchObject({ "Content-Type": "image/jpeg", "Inject-Node": "n1", "Payload-FileName": "frame.jpg" });
        expect(Number(headers["X-Capture-Ts"])).toBeGreaterThan(1.7e12);
        expect(getInjectStatus("n1").running).toBe(false);
    });

    it("sends a small audio clip as is", async () => {
        const file = new File([new Uint8Array(100)], "voz.mp3", { type: "" });
        const publish = vi.fn();
        await injectFile("n2", file, {}, publish);
        expect(publish.mock.calls[0][1]["Content-Type"]).toBe("audio/mpeg");
    });

    it("gives the same status object while nothing changes (useSyncExternalStore loops otherwise: React error 185)", () => {
        expect(getInjectStatus("never-used")).toBe(getInjectStatus("never-used"));
    });

    it("refuses other files", async () => {
        await expect(injectFile("n3", new File(["x"], "a.txt", { type: "text/plain" }), {}, vi.fn())).rejects.toThrow(/not an image/);
    });

    it("keeps the file of each node in this browser", async () => {
        const file = new File(["x"], "a.png", { type: "image/png" });
        await setInjectFile("n4", file);
        expect(await getInjectFile("n4")).toBe(file);
        await setInjectFile("n4", null);
        expect(await getInjectFile("n4")).toBeNull();
    });
});

describe("inject a file: editor", () => {
    it("chooses a file and shows the options of its kind", async () => {
        const onChange = vi.fn();
        render(<InjectFileSettingsEditor nodeUid="n5" settings={{}} onChange={onChange} />);
        await waitFor(() => expect(screen.getByText("No file")).toBeTruthy());
        const video = new File([new Uint8Array(2_000_000)], "video.mp4", { type: "video/mp4" });
        fireEvent.change(screen.getByLabelText("Inject file"), { target: { files: [video] } });
        expect(onChange).toHaveBeenCalledWith("fileName", "video.mp4");
        expect(onChange).toHaveBeenCalledWith("fileKind", "video");
        expect(await screen.findByLabelText("Frames per second")).toBeTruthy();
        expect(screen.getByText(/video\.mp4 · video · 1\.9 MB/)).toBeTruthy();
    });

    it("says when the file of a saved node is not in this browser", async () => {
        render(<InjectFileSettingsEditor nodeUid="n6" settings={{ fileName: "clip.wav", fileKind: "audio" }} onChange={vi.fn()} />);
        expect(await screen.findByText(/clip\.wav: not in this browser/)).toBeTruthy();
    });
});
