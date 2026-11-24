// The scenes of the canvases of a twin's slides while its Viewer is open: read when a slide with a canvas is shown,
// edited in memory with the layout, written to admin_api when the layout is saved (before it: the save removes the
// scenes of the canvases it no longer has), forgotten when the editing is cancelled.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiAuth } from "../viewerLayoutApi";
import { TwinRef } from "../viewerDataApi";
import { WorkspaceLayout } from "../workspaceLayout";
import { CanvasScene, emptyCanvasScene } from "./canvasScene";
import { loadSlideCanvas, saveSlideCanvas } from "./canvasApi";

export interface CanvasEntry {
    // undefined: being read
    scene?: CanvasScene;
    // changes when the scene is read or discarded: the board is drawn again
    key: number;
    // edited since it was read
    dirty?: boolean;
    error?: string;
}

export interface SlideCanvases {
    entryOf: (slideId: string) => CanvasEntry | undefined;
    setScene: (slideId: string, scene: CanvasScene) => void;
    // a duplicated slide: a copy of its source's scene, saved with the layout
    copy: (from: string, to: string) => void;
    // the scenes edited (of the slides that keep a canvas in `layout`) written; the slides that failed
    saveEdited: (layout: WorkspaceLayout) => Promise<string[]>;
    // the edits forgotten: the scenes are read again
    discard: () => void;
    // every scene read again (new ones were loaded: Viewer data)
    reload: () => void;
    hasEdits: boolean;
}

let keys = 0;

export const useSlideCanvases = (twin: TwinRef | null, auth: ApiAuth, shownSlide: string | null): SlideCanvases => {
    const [entries, setEntries] = useState<Record<string, CanvasEntry>>({});
    const entriesRef = useRef(entries);
    entriesRef.current = entries;
    const twinKey = twin ? `${twin.groupId}/${twin.digitalTwinId}` : "";
    // another twin: nothing of the one before
    useEffect(() => setEntries({}), [twinKey]);

    const authRef = useRef(auth);
    authRef.current = auth;
    useEffect(() => {
        if (!twin || !shownSlide || entriesRef.current[shownSlide]) return;
        const controller = new AbortController();
        const slideId = shownSlide;
        setEntries((prev) => ({ ...prev, [slideId]: { key: ++keys } }));
        loadSlideCanvas({ ...twin, slideId }, authRef.current, controller.signal)
            .then((scene) => setEntries((prev) => ({ ...prev, [slideId]: { scene: scene ?? emptyCanvasScene(), key: ++keys } })))
            .catch((error) => {
                if (error?.name === "CanceledError" || error?.name === "AbortError") {
                    setEntries((prev) => {
                        const next = { ...prev };
                        if (next[slideId]?.scene === undefined) delete next[slideId];
                        return next;
                    });
                    return;
                }
                setEntries((prev) => ({ ...prev, [slideId]: { key: ++keys, error: error?.response?.data?.message || "The canvas could not be read" } }));
            });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [twinKey, shownSlide]);

    const setScene = useCallback((slideId: string, scene: CanvasScene) => {
        // the board keeps drawing (same key)
        setEntries((prev) => ({ ...prev, [slideId]: { scene, key: prev[slideId]?.key ?? ++keys, dirty: true } }));
    }, []);

    const copy = useCallback((from: string, to: string) => {
        const source = entriesRef.current[from]?.scene;
        if (source) setEntries((prev) => ({ ...prev, [to]: { scene: JSON.parse(JSON.stringify(source)), key: ++keys, dirty: true } }));
    }, []);

    const saveEdited = useCallback(
        async (layout: WorkspaceLayout) => {
            if (!twin) return [];
            const failed: string[] = [];
            const withCanvas = new Set(layout.slides.filter((s) => s.canvas).map((s) => s.id));
            for (const [slideId, entry] of Object.entries(entriesRef.current)) {
                if (!entry.dirty || !entry.scene || !withCanvas.has(slideId)) continue;
                try {
                    await saveSlideCanvas({ ...twin, slideId }, entry.scene, authRef.current);
                    setEntries((prev) => (prev[slideId] ? { ...prev, [slideId]: { ...prev[slideId], dirty: false } } : prev));
                } catch {
                    failed.push(slideId);
                }
            }
            return failed;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [twinKey],
    );

    const discard = useCallback(() => {
        setEntries((prev) => {
            const next: Record<string, CanvasEntry> = {};
            for (const [id, entry] of Object.entries(prev)) if (!entry.dirty) next[id] = entry;
            return next;
        });
    }, []);

    const reload = useCallback(() => setEntries({}), []);

    const entryOf = useCallback((slideId: string) => entries[slideId], [entries]);
    return { entryOf, setScene, copy, saveEdited, discard, reload, hasEdits: Object.values(entries).some((e) => e.dirty) };
};
