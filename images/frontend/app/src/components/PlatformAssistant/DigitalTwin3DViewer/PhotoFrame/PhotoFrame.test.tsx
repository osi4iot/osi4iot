import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageFrame, framesPerSecond, photoAge } from "./PhotoFrame";
import { createFrameStore } from "../Workspace/frameStore";

beforeEach(() => {
    // jsdom has no image decoder: a tiny bitmap
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() }));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as any;
});
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => {
    await Promise.resolve();
    await Promise.resolve();
});

describe("video and photo panels", () => {
    it("tells the fps and the age of a photo", () => {
        expect(framesPerSecond([0, 200, 400, 600, 800, 1000], 1000)).toBe(5);
        expect(framesPerSecond([0], 10_000)).toBe(0);
        const at = new Date(2026, 10, 11, 12, 3, 41).getTime();
        expect(photoAge(at, at + 3000)).toMatch(/just now$/);
        expect(photoAge(at, at + 185_000)).toMatch(/3 min ago$/);
    });

    it("pauses a video and continues with the newest frame", async () => {
        const { store, publish } = createFrameStore();
        render(<ImageFrame frameStore={store} source="dev2dtm_1" mode="video" />);
        expect(screen.getByText("Waiting for frames")).toBeInTheDocument();
        publish(new Blob(["a"]), "dev2dtm_1");
        await flush();
        const pause = screen.getByRole("button", { name: "Pause" });
        fireEvent.click(pause);
        expect(screen.getByText("Paused")).toBeInTheDocument();
        const calls = (globalThis as any).createImageBitmap.mock.calls.length;
        publish(new Blob(["b"]), "dev2dtm_1");
        publish(new Blob(["c"]), "dev2dtm_1");
        await flush();
        // paused: nothing drawn
        expect((globalThis as any).createImageBitmap.mock.calls.length).toBe(calls);
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        await flush();
        // the newest one only
        expect((globalThis as any).createImageBitmap.mock.calls.length).toBe(calls + 1);
        expect((globalThis as any).createImageBitmap.mock.calls.at(-1)[0].size).toBe(1);
        expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "false");
    });

    it("shows when the last photo arrived", async () => {
        const { store, publish } = createFrameStore();
        render(<ImageFrame frameStore={store} source="dev2dtm_2" mode="photo" />);
        expect(screen.getByText("No photo yet")).toBeInTheDocument();
        publish(new Blob(["p"]), "dev2dtm_2", Date.now() - 125_000);
        await flush();
        expect(screen.getByText(/2 min ago$/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });
});
