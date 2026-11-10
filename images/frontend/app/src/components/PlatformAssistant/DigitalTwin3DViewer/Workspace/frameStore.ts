// The frames (images) that reach the viewer, for the Image panels of the Viewer page. A frame comes with the
// topicRef of the topic it arrived on (dtm2sim, dev2sim…): each Image panel listens to one source, or to
// "any" (every frame, as the single Image panel of earlier versions).
//
// Frames do not go through React state: a listener (ImageFrame) paints each frame on its canvas, and nothing
// else re-renders. The store keeps the latest frame of each source, so a panel added later starts with it.

export const ANY_SOURCE = "any";

export type FrameListener = (frame: Blob) => void;
export type SourcesListener = (sources: string[]) => void;

export interface FrameStore {
    /** Registers a listener of a source ("any": all); it immediately gets the latest frame, if any. */
    subscribe: (listener: FrameListener, source?: string) => () => void;
    /** The sources that have sent frames so far (sorted), and the changes of that list. */
    subscribeSources: (listener: SourcesListener) => () => void;
}

export interface FrameStoreHandle {
    store: FrameStore;
    publish: (frame: Blob, source?: string) => void;
}

export const createFrameStore = (): FrameStoreHandle => {
    const listeners = new Map<string, Set<FrameListener>>();
    const latest = new Map<string, Blob>();
    let latestAny: Blob | null = null;
    const sourceListeners = new Set<SourcesListener>();
    const sources = (): string[] => Array.from(latest.keys()).sort();

    const listenersOf = (source: string) => {
        let set = listeners.get(source);
        if (!set) {
            set = new Set();
            listeners.set(source, set);
        }
        return set;
    };

    return {
        store: {
            subscribe: (listener, source = ANY_SOURCE) => {
                listenersOf(source).add(listener);
                const last = source === ANY_SOURCE ? latestAny : latest.get(source);
                if (last) listener(last);
                return () => {
                    listeners.get(source)?.delete(listener);
                };
            },
            subscribeSources: (listener) => {
                sourceListeners.add(listener);
                listener(sources());
                return () => {
                    sourceListeners.delete(listener);
                };
            },
        },
        publish: (frame, source = "") => {
            latestAny = frame;
            const isNewSource = source !== "" && !latest.has(source);
            if (source !== "") {
                latest.set(source, frame);
                listeners.get(source)?.forEach((listener) => listener(frame));
            }
            listeners.get(ANY_SOURCE)?.forEach((listener) => listener(frame));
            if (isNewSource) {
                const list = sources();
                sourceListeners.forEach((listener) => listener(list));
            }
        },
    };
};
