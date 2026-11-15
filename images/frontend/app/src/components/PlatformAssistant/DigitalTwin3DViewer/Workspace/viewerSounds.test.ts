import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveValueStore } from "./liveValues";
import { MIN_REPEAT_MS, createSoundPlayer, loadSoundEnabled, saveSoundEnabled, soundOf, soundTopics, toneDuration, useViewerSounds } from "./viewerSounds";

// a fake Web Audio context: counts the oscillators started
class FakeParam {
    setValueAtTime = vi.fn();
    linearRampToValueAtTime = vi.fn();
}
let started = 0;
let contexts = 0;
class FakeContext {
    state = "running";
    currentTime = 0;
    destination = {};
    constructor() {
        contexts++;
    }
    createOscillator() {
        return { type: "sine", frequency: new FakeParam(), connect: vi.fn(), start: () => started++, stop: vi.fn() };
    }
    createGain() {
        return { gain: new FakeParam(), connect: vi.fn() };
    }
    resume() {
        this.state = "running";
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
}

beforeEach(() => {
    started = 0;
    contexts = 0;
    window.localStorage.clear();
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
});
afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("soundOf", () => {
    it("reads the field sound of a message when it names a known sound", () => {
        expect(soundOf({ sound: "granted" })).toBe("granted");
        expect(soundOf({ sound: " Denied " })).toBe("denied");
        expect(soundOf({ sound: "trumpet" })).toBeNull();
        expect(soundOf({ sound: 1 })).toBeNull();
        expect(soundOf({ workers: 2 })).toBeNull();
        expect(soundOf(null)).toBeNull();
        expect(soundOf("granted")).toBeNull();
    });
});

describe("the setting", () => {
    it("is off by default and is remembered", () => {
        expect(loadSoundEnabled()).toBe(false);
        saveSoundEnabled(true);
        expect(loadSoundEnabled()).toBe(true);
        saveSoundEnabled(false);
        expect(loadSoundEnabled()).toBe(false);
    });

    it("listens to dtm2sim only while on and when the twin has it", () => {
        expect(soundTopics(true, ["dtm2sim", "dev2pdb_1"])).toEqual(["dtm2sim"]);
        expect(soundTopics(false, ["dtm2sim"])).toEqual([]);
        expect(soundTopics(true, ["dev2pdb_1"])).toEqual([]);
    });
});

describe("createSoundPlayer", () => {
    it("plays the tones of a sound and drops a repetition within MIN_REPEAT_MS", () => {
        let t = 0;
        const player = createSoundPlayer(() => t, FakeContext as unknown as typeof AudioContext);
        expect(player.play("granted")).toBe(true);
        expect(started).toBe(2);
        t = MIN_REPEAT_MS - 1;
        expect(player.play("granted")).toBe(false);
        expect(player.play("denied")).toBe(true); // another sound is not held back
        t = MIN_REPEAT_MS + 1;
        expect(player.play("granted")).toBe(true);
        expect(started).toBe(5);
    });

    it("does nothing without Web Audio", () => {
        const player = createSoundPlayer(Date.now, null);
        expect(player.play("alarm")).toBe(false);
    });

    it("has short sounds", () => {
        for (const name of ["granted", "denied", "alarm", "warning", "notify"] as const) expect(toneDuration(name)).toBeLessThanOrEqual(1);
    });
});

describe("useViewerSounds", () => {
    it("plays only while on, and only for the messages that carry a sound", () => {
        const store = createLiveValueStore();
        const { result } = renderHook(() => useViewerSounds(store, true));
        expect(result.current.enabled).toBe(false);
        act(() => store.publish("dtm2sim", { sound: "granted" }));
        expect(started).toBe(0); // muted

        act(() => result.current.toggle());
        expect(result.current.enabled).toBe(true);
        expect(loadSoundEnabled()).toBe(true);
        expect(started).toBe(1); // the note that says the sound works

        act(() => store.publish("dtm2sim", { sound: "denied", workers: 1 }));
        expect(started).toBe(2);
        // the next message has no sound: the field kept by the store must not play it again
        act(() => store.publish("dtm2sim", { workers: 1 }));
        expect(started).toBe(2);

        act(() => result.current.toggle());
        expect(result.current.enabled).toBe(false);
        expect(loadSoundEnabled()).toBe(false);
        act(() => store.publish("dtm2sim", { sound: "alarm" }));
        expect(started).toBe(2);
    });

    it("stays off when the twin has no dtm2sim topic", () => {
        saveSoundEnabled(true);
        const store = createLiveValueStore();
        const { result } = renderHook(() => useViewerSounds(store, false));
        expect(result.current.enabled).toBe(false);
        act(() => store.publish("dtm2sim", { sound: "granted" }));
        expect(started).toBe(0);
        expect(contexts).toBe(0);
    });
});
