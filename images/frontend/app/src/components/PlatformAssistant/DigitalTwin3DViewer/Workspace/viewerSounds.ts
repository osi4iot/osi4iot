// The sounds of the viewer: a pipeline asks for one by sending a message to the viewer (topic dtm2sim) with a
// field "sound", e.g. {"sound": "granted"}. The viewer plays it when the user has turned the sound on (button of
// the top bar). It is off by default, the choice is remembered in the browser, and the browsers only allow
// sound after a click on the page: turning it on is that click.
//
// The sounds are synthesized (Web Audio): no files. A pipeline sends "sound" only when something happens (a
// change of state), not in every message: the viewer also drops a sound repeated within MIN_REPEAT_MS.
import { useEffect, useState } from "react";
import type { LiveValueStore } from "./liveValues";

export const SOUND_NAMES = ["granted", "denied", "alarm", "warning", "notify"] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export const SOUND_TOPIC = "dtm2sim";
export const MIN_REPEAT_MS = 1500;
const STORAGE_KEY = "osi4iot.viewer.sound";

// the sound a message asks for: its field "sound", when it names a known sound
export const soundOf = (payload: unknown): SoundName | null => {
    if (!payload || typeof payload !== "object") return null;
    const value = (payload as Record<string, unknown>).sound;
    if (typeof value !== "string") return null;
    const name = value.trim().toLowerCase();
    return (SOUND_NAMES as readonly string[]).includes(name) ? (name as SoundName) : null;
};

export const loadSoundEnabled = (): boolean => {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
        return false;
    }
};

export const saveSoundEnabled = (enabled: boolean) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
        // private mode, blocked storage: the choice lasts while the page is open
    }
};

// --- the tones ------------------------------------------------------------------------------------------------

interface Tone {
    freq: number;
    // frequency at the end of the tone (a glide), default: freq
    to?: number;
    start: number;
    duration: number;
    type: OscillatorType;
    gain: number;
}

const TONES: Record<SoundName, Tone[]> = {
    // two ascending notes: approval
    granted: [
        { freq: 880, start: 0, duration: 0.13, type: "sine", gain: 0.28 },
        { freq: 1318.5, start: 0.13, duration: 0.22, type: "sine", gain: 0.28 },
    ],
    // a low falling buzz: rejection
    denied: [{ freq: 220, to: 160, start: 0, duration: 0.45, type: "square", gain: 0.12 }],
    // three urgent two-tone pulses
    alarm: [0, 1, 2].flatMap((i) => [
        { freq: 988, start: i * 0.32, duration: 0.15, type: "square" as OscillatorType, gain: 0.1 },
        { freq: 740, start: i * 0.32 + 0.16, duration: 0.15, type: "square" as OscillatorType, gain: 0.1 },
    ]),
    // two soft pulses
    warning: [
        { freq: 660, start: 0, duration: 0.18, type: "triangle", gain: 0.3 },
        { freq: 660, start: 0.26, duration: 0.18, type: "triangle", gain: 0.3 },
    ],
    // one short soft note
    notify: [{ freq: 1046.5, start: 0, duration: 0.16, type: "sine", gain: 0.22 }],
};

export const toneDuration = (name: SoundName) => Math.max(...TONES[name].map((t) => t.start + t.duration));

type AudioContextClass = typeof AudioContext;

const audioContextClass = (): AudioContextClass | null => {
    if (typeof window === "undefined") return null;
    return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext ?? null;
};

export interface SoundPlayer {
    // create or resume the audio context: call it from a click (the browsers' rule)
    unlock: () => void;
    // play a sound; false when it was not played (no audio, repeated too soon)
    play: (name: SoundName) => boolean;
    close: () => void;
}

export const createSoundPlayer = (now: () => number = Date.now, Ctx: AudioContextClass | null = audioContextClass()): SoundPlayer => {
    let ctx: AudioContext | null = null;
    const lastPlayed = new Map<SoundName, number>();
    const context = () => {
        if (!Ctx) return null;
        if (!ctx) ctx = new Ctx();
        return ctx;
    };
    return {
        unlock: () => {
            const c = context();
            if (c && c.state === "suspended") c.resume().catch(() => undefined);
        },
        play: (name) => {
            const t = now();
            const last = lastPlayed.get(name);
            if (last !== undefined && t - last < MIN_REPEAT_MS) return false;
            const c = context();
            if (!c) return false;
            if (c.state === "suspended") c.resume().catch(() => undefined);
            lastPlayed.set(name, t);
            const t0 = c.currentTime + 0.02;
            for (const tone of TONES[name]) {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = tone.type;
                const start = t0 + tone.start;
                const end = start + tone.duration;
                osc.frequency.setValueAtTime(tone.freq, start);
                if (tone.to) osc.frequency.linearRampToValueAtTime(tone.to, end);
                // short attack and release: no clicks
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.linearRampToValueAtTime(tone.gain, start + 0.01);
                gain.gain.setValueAtTime(tone.gain, Math.max(start + 0.01, end - 0.04));
                gain.gain.linearRampToValueAtTime(0.0001, end);
                osc.connect(gain);
                gain.connect(c.destination);
                osc.start(start);
                osc.stop(end + 0.02);
            }
            return true;
        },
        close: () => {
            ctx?.close().catch(() => undefined);
            ctx = null;
        },
    };
};

// --- the hook of the viewer -----------------------------------------------------------------------------------

// The sound setting of the viewer and the player: plays the sounds the messages of dtm2sim ask for while the
// sound is on. The store must be subscribed to dtm2sim while it is on (soundTopics).
export const useViewerSounds = (store: LiveValueStore, available: boolean) => {
    const [enabled, setEnabled] = useState<boolean>(loadSoundEnabled);
    const [player] = useState(() => createSoundPlayer());
    const on = enabled && available;
    useEffect(() => {
        if (!on) return;
        // a setting remembered from another visit: the browser allows sound after the first click on the page
        const unlockOnce = () => player.unlock();
        document.addEventListener("pointerdown", unlockOnce, { once: true });
        const off = store.subscribe(SOUND_TOPIC, (message) => {
            const name = soundOf(message.last);
            if (name) player.play(name);
        });
        return () => {
            off();
            document.removeEventListener("pointerdown", unlockOnce);
        };
    }, [on, store, player]);
    useEffect(() => () => player.close(), [player]);
    const toggle = () => {
        const next = !enabled;
        setEnabled(next);
        saveSoundEnabled(next);
        if (next) {
            // this click unlocks the audio, and a short note says that the sound works
            player.unlock();
            player.play("notify");
        }
    };
    return { enabled: on, toggle };
};

// the topics the viewer must listen to for the sounds
export const soundTopics = (enabled: boolean, twinTopics: string[]): string[] => (enabled && twinTopics.includes(SOUND_TOPIC) ? [SOUND_TOPIC] : []);
