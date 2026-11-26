// The clock of the series played by a Picture panel (pictureBindings.ts, `timePath`), shared with the Data charts of
// the same frame that show a playback cursor: one clock per scope (the slide, or "<slide>:<frame>" of a canvas).
// The panel that plays sets its time (each frame of the screen); the charts listen to it. Only in the browser, for
// the viewer shown: nothing is saved nor sent.

export interface PlaybackState {
    // the time of the series shown (s), and how long they last; null: nothing is playing
    time: number | null;
    duration: number;
}

type Listener = (state: PlaybackState) => void;

interface Clock {
    state: PlaybackState;
    listeners: Set<Listener>;
}

const clocks = new Map<string, Clock>();

const clockOf = (key: string): Clock => {
    let clock = clocks.get(key);
    if (!clock) {
        clock = { state: { time: null, duration: 0 }, listeners: new Set() };
        clocks.set(key, clock);
    }
    return clock;
};

export const setPlayback = (key: string, state: PlaybackState) => {
    const clock = clockOf(key);
    clock.state = state;
    clock.listeners.forEach((listener) => listener(state));
};

export const playbackOf = (key: string): PlaybackState => clockOf(key).state;

// called with every new time; returns the unsubscribe
export const subscribePlayback = (key: string, listener: Listener): (() => void) => {
    const clock = clockOf(key);
    clock.listeners.add(listener);
    return () => {
        clock.listeners.delete(listener);
        if (clock.listeners.size === 0 && clock.state.time === null) clocks.delete(key);
    };
};

// the playback speeds offered (1: real time)
export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 2] as const;
export const DEFAULT_PLAYBACK_SPEED = 1;
export const isPlaybackSpeed = (v: unknown): v is number => typeof v === "number" && (PLAYBACK_SPEEDS as readonly number[]).includes(v);
